/*
 * Copyright (C) 2016 - present Juergen Zimmermann, Hochschule Karlsruhe
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * Das Modul besteht aus der Klasse {@linkcode FlugzeugWriteService} für die
 * Schreiboperationen im Anwendungskern.
 * @packageDocumentation
 */

import { type DeleteResult, Repository } from 'typeorm';
import { Injectable, NotFoundException } from '@nestjs/common';
import {
    VersionInvalidException,
    VersionOutdatedException,
} from './exceptions.js';

import { Flugzeug } from '../entity/flugzeug.entity.js';
import { FlugzeugReadService } from './flugzeug-read.service.js';
import { InjectRepository } from '@nestjs/typeorm';
import { MailService } from '../../mail/mail.service.js';
import { Modell } from '../entity/modell.entity.js';
import { Sitzplatz } from '../entity/sitzplatz.entity.js';
import { getLogger } from '../../logger/logger.js';

/** Typdefinitionen zum Aktualisieren eines Flugzeuges mit `update`. */
export interface UpdateParams {
    /** ID des zu aktualisierenden Flugzeuges. */
    readonly id: number | undefined;
    /** Flugzeug-Objekt mit den aktualisierten Werten. */
    readonly flugzeug: Flugzeug;
    /** Versionsnummer für die aktualisierenden Werte. */
    readonly version: string;
}

/**
 * Die Klasse `FlugzeugWriteService` implementiert den Anwendungskern für das
 * Schreiben von Flugzeugen und greift mit _TypeORM_ auf die DB zu.
 */
@Injectable()
export class FlugzeugWriteService {
    private static readonly VERSION_PATTERN = /^"\d{1,3}"/u;

    readonly #repo: Repository<Flugzeug>;

    readonly #readService: FlugzeugReadService;

    readonly #mailService: MailService;

    readonly #logger = getLogger(FlugzeugWriteService.name);

    constructor(
        @InjectRepository(Flugzeug) repo: Repository<Flugzeug>,
        readService: FlugzeugReadService,
        mailService: MailService,
    ) {
        this.#repo = repo;
        this.#readService = readService;
        this.#mailService = mailService;
    }

    /**
     * Ein neues Flugzeug soll angelegt werden.
     * @param flugzeug Das neu abzulegende Flugzeug
     * @returns Die ID des neu angelegten Flugzeuges
     * @throws IsbnExists falls die ISBN-Nummer bereits existiert
     */
    async create(flugzeug: Flugzeug): Promise<number> {
        this.#logger.debug('create: flugzeug=%o', flugzeug);

        const flugzeugDb = await this.#repo.save(flugzeug); // implizite Transaktion
        this.#logger.debug('create: flugzeugDb=%o', flugzeugDb);

        await this.#sendmail(flugzeugDb);

        return flugzeugDb.id!;
    }

    /**
     * Ein vorhandenes Flugzeug soll aktualisiert werden. "Destructured" Argument
     * mit id (ID des zu aktualisierenden Flugzeuges), flugzeug (zu aktualisierendes Flugzeug)
     * und version (Versionsnummer für optimistische Synchronisation).
     * @returns Die neue Versionsnummer gemäß optimistischer Synchronisation
     * @throws NotFoundException falls kein Flugzeug zur ID vorhanden ist
     * @throws VersionInvalidException falls die Versionsnummer ungültig ist
     * @throws VersionOutdatedException falls die Versionsnummer veraltet ist
     */
    // https://2ality.com/2015/01/es6-destructuring.html#simulating-named-parameters-in-javascript
    async update({ id, flugzeug, version }: UpdateParams): Promise<number> {
        this.#logger.debug(
            'update: id=%d, flugzeug=%o, version=%s',
            id,
            flugzeug,
            version,
        );
        if (id === undefined) {
            this.#logger.debug('update: Keine gueltige ID');
            throw new NotFoundException(`
            Es gibt kein Flugzeug mit der ID ${id}.`);
        }

        const validateResult = await this.#validateUpdate(
            flugzeug,
            id,
            version,
        );
        this.#logger.debug('update: validateResult=%o', validateResult);
        if (!(validateResult instanceof Flugzeug)) {
            return validateResult;
        }

        const flugzeugNeu = validateResult;
        const merged = this.#repo.merge(flugzeugNeu, flugzeug);
        this.#logger.debug('update: merged=%o', merged);
        const updated = await this.#repo.save(merged); // implizite Transaktion
        this.#logger.debug('update: updated=%o', updated);

        return updated.version!;
    }

    /**
     * Ein Flugzeug wird asynchron anhand seiner ID gelöscht.
     *
     * @param id ID des zu löschenden Flugzeuges
     * @returns true, falls das Flugzeug vorhanden war und gelöscht wurde. Sonst false.
     */
    async delete(id: number) {
        this.#logger.debug('delete: id=%d', id);
        const flugzeug = await this.#readService.findById({
            id,
            mitSitzplaetze: true,
        });

        let deleteResult: DeleteResult | undefined;
        await this.#repo.manager.transaction(async (transactionalMgr) => {
            // Das Flugzeug zur gegebenen ID mit Modell und Sitzpl. asynchron loeschen

            // TODO "cascade" funktioniert nicht beim Loeschen
            const modellId = flugzeug.modell?.id;
            if (modellId !== undefined) {
                await transactionalMgr.delete(Modell, modellId);
            }
            const sitzplaetze = flugzeug.sitzplaetze ?? [];
            for (const sitzplatz of sitzplaetze) {
                await transactionalMgr.delete(Sitzplatz, sitzplatz.id);
            }

            deleteResult = await transactionalMgr.delete(Flugzeug, id);
            this.#logger.debug('delete: deleteResult=%o', deleteResult);
        });

        return (
            deleteResult?.affected !== undefined &&
            deleteResult.affected !== null &&
            deleteResult.affected > 0
        );
    }

    async #sendmail(flugzeug: Flugzeug) {
        const subject = `Neues Flugzeug ${flugzeug.id}`;
        const modell = flugzeug.modell?.modell ?? 'N/A';
        const body = `Das Flugzeug mit dem Modell <strong>${modell}</strong> ist angelegt`;
        await this.#mailService.sendmail({ subject, body });
    }

    async #validateUpdate(
        flugzeug: Flugzeug,
        id: number,
        versionStr: string,
    ): Promise<Flugzeug> {
        this.#logger.debug(
            '#validateUpdate: flugzeug=%o, id=%s, versionStr=%s',
            flugzeug,
            id,
            versionStr,
        );
        if (!FlugzeugWriteService.VERSION_PATTERN.test(versionStr)) {
            throw new VersionInvalidException(versionStr);
        }

        const version = Number.parseInt(versionStr.slice(1, -1), 10);
        this.#logger.debug(
            '#validateUpdate: flugzeug=%o, version=%d',
            flugzeug,
            version,
        );

        const flugzeugDb = await this.#readService.findById({ id });

        // nullish coalescing
        const versionDb = flugzeugDb.version!;
        if (version < versionDb) {
            this.#logger.debug('#validateUpdate: versionDb=%d', version);
            throw new VersionOutdatedException(version);
        }
        this.#logger.debug('#validateUpdate: flugzeugDb=%o', flugzeugDb);
        return flugzeugDb;
    }
}

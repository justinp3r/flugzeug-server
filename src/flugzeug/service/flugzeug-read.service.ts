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
 * Das Modul besteht aus der Klasse {@linkcode FlugzeugReadService}.
 * @packageDocumentation
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { Flugzeug } from '../entity/flugzeug.entity.js';
import { QueryBuilder } from './query-builder.js';
import { type Suchkriterien } from './suchkriterien.js';
import { getLogger } from '../../logger/logger.js';

/**
 * Typdefinition für `findById`
 */
export interface FindByIdParams {
    /** ID des gesuchten Flugzeugs */
    readonly id: number;
    /** Sollen die sitzplaetze mitgeladen werden? */
    readonly mitSitzplaetze?: boolean;
}

/**
 * Die Klasse `FlugzeugReadService` implementiert das Lesen für Bücher und greift
 * mit _TypeORM_ auf eine relationale DB zu.
 */
@Injectable()
export class FlugzeugReadService {
    static readonly ID_PATTERN = /^[1-9]\d{0,10}$/u;

    readonly #flugzeugProps: string[];

    readonly #queryBuilder: QueryBuilder;

    readonly #logger = getLogger(FlugzeugReadService.name);

    constructor(queryBuilder: QueryBuilder) {
        const flugzeugDummy = new Flugzeug();
        this.#flugzeugProps = Object.getOwnPropertyNames(flugzeugDummy);
        this.#queryBuilder = queryBuilder;
    }

    // Rueckgabetyp Promise bei asynchronen Funktionen
    //    ab ES2015
    //    vergleiche Task<> bei C# und Mono<> aus Project Reactor
    // Status eines Promise:
    //    Pending: das Resultat ist noch nicht vorhanden, weil die asynchrone
    //             Operation noch nicht abgeschlossen ist
    //    Fulfilled: die asynchrone Operation ist abgeschlossen und
    //               das Promise-Objekt hat einen Wert
    //    Rejected: die asynchrone Operation ist fehlgeschlagen and das
    //              Promise-Objekt wird nicht den Status "fulfilled" erreichen.
    //              Im Promise-Objekt ist dann die Fehlerursache enthalten.

    /**
     * Ein Flugzeug asynchron anhand seiner ID suchen
     * @param id ID des gesuchten Flugzeuges
     * @returns Das gefundene Flugzeug vom Typ [Flugzeug](flugzeug_entity_flugzeug_entity.Flugzeug.html)
     *          in einem Promise aus ES2015.
     * @throws NotFoundException falls kein Flugzeug mit der ID existiert
     */
    // https://2ality.com/2015/01/es6-destructuring.html#simulating-named-parameters-in-javascript
    async findById({ id, mitSitzplaetze = false }: FindByIdParams) {
        this.#logger.debug('findById: id=%d', id);

        // https://typeorm.io/working-with-repository
        // Das Resultat ist undefined, falls kein Datensatz gefunden
        // Lesen: Keine Transaktion erforderlich
        const flugzeug = await this.#queryBuilder
            .buildId({ id, mitSitzplaetze })
            .getOne();
        if (flugzeug === null) {
            // eslint-disable-next-line prettier/prettier
            throw new NotFoundException(`Es gibt kein Flugzeug mit der ID ${id}.`);
        }
        if (this.#logger.isLevelEnabled('debug')) {
            this.#logger.debug(
                'findById: flugzeug=%s, modell=%o',
                flugzeug.toString(),
                flugzeug.modell,
            );
            if (mitSitzplaetze) {
                this.#logger.debug(
                    'findById: abbildungen=%o',
                    flugzeug.sitzplaetze,
                );
            }
        }
        return flugzeug;
    }

    /**
     * Bücher asynchron suchen.
     * @param suchkriterien JSON-Objekt mit Suchkriterien
     * @returns Ein JSON-Array mit den gefundenen Büchern.
     * @throws NotFoundException falls keine Bücher gefunden wurden.
     */
    async find(suchkriterien?: Suchkriterien) {
        this.#logger.debug('find: suchkriterien=%o', suchkriterien);

        // Keine Suchkriterien?
        if (suchkriterien === undefined) {
            return this.#queryBuilder.build({}).getMany();
        }
        const keys = Object.keys(suchkriterien);
        if (keys.length === 0) {
            return this.#queryBuilder.build(suchkriterien).getMany();
        }

        // Falsche Namen fuer Suchkriterien?
        if (!this.#checkKeys(keys)) {
            throw new NotFoundException('Ungueltige Suchkriterien');
        }

        // QueryBuilder https://typeorm.io/select-query-builder
        // Das Resultat ist eine leere Liste, falls nichts gefunden
        // Lesen: Keine Transaktion erforderlich
        const flugzeuge = await this.#queryBuilder
            .build(suchkriterien)
            .getMany();
        if (flugzeuge.length === 0) {
            this.#logger.debug('find: Keine Buecher gefunden');
            throw new NotFoundException(
                `Keine Flugzeuge gefunden: ${JSON.stringify(suchkriterien)}`,
            );
        }
        return flugzeuge;
    }

    #checkKeys(keys: string[]) {
        // Ist jedes Suchkriterium auch eine Property von Flugzeug?
        let validKeys = true;
        keys.forEach((key) => {
            if (
                !this.#flugzeugProps.includes(key) &&
                key !== 'javascript' &&
                key !== 'typescript'
            ) {
                this.#logger.debug(
                    '#checkKeys: ungueltiges Suchkriterium "%s"',
                    key,
                );
                validKeys = false;
            }
        });

        return validKeys;
    }
}

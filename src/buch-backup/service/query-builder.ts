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
 * Das Modul besteht aus der Klasse {@linkcode QueryBuilder}.
 * @packageDocumentation
 */

import { Abbildung } from '../entity/abbildung.entity.js';
import { Flugzeug } from '../entity/flugzeug.entity.js';
import { InjectRepository } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';
import { Modell } from '../entity/modell.entity.js';
import { Repository } from 'typeorm';
import { type Suchkriterien } from './suchkriterien.js';
import { getLogger } from '../../logger/logger.js';
import { typeOrmModuleOptions } from '../../config/typeormOptions.js';

/** Typdefinitionen für die Suche mit der Buch-ID. */
export interface BuildIdParams {
    /** ID des gesuchten Buchs. */
    readonly id: number;
    /** Sollen die Abbildungen mitgeladen werden? */
    readonly mitAbbildungen?: boolean;
}
/**
 * Die Klasse `QueryBuilder` implementiert das Lesen für Bücher und greift
 * mit _TypeORM_ auf eine relationale DB zu.
 */
@Injectable()
export class QueryBuilder {
    readonly #flugzeugAlias = `${Flugzeug.name
        .charAt(0)
        .toLowerCase()}${Flugzeug.name.slice(1)}`;

    readonly #modellAlias = `${Modell.name
        .charAt(0)
        .toLowerCase()}${Modell.name.slice(1)}`;

    readonly #abbildungAlias = `${Abbildung.name
        .charAt(0)
        .toLowerCase()}${Abbildung.name.slice(1)}`;

    readonly #repo: Repository<Flugzeug>;

    readonly #logger = getLogger(QueryBuilder.name);

    constructor(@InjectRepository(Flugzeug) repo: Repository<Flugzeug>) {
        this.#repo = repo;
    }

    /**
     * Ein Buch mit der ID suchen.
     * @param id ID des gesuchten Buches
     * @returns QueryBuilder
     */
    buildId({ id, mitAbbildungen = false }: BuildIdParams) {
        // QueryBuilder "buch" fuer Repository<Buch>
        const queryBuilder = this.#repo.createQueryBuilder(this.#flugzeugAlias);

        // Fetch-Join: aus QueryBuilder "buch" die Property "titel" ->  Tabelle "titel"
        queryBuilder.innerJoinAndSelect(
            `${this.#flugzeugAlias}.titel`,
            this.#modellAlias,
        );

        if (mitAbbildungen) {
            // Fetch-Join: aus QueryBuilder "buch" die Property "abbildungen" -> Tabelle "abbildung"
            queryBuilder.leftJoinAndSelect(
                `${this.#flugzeugAlias}.abbildungen`,
                this.#abbildungAlias,
            );
        }

        queryBuilder.where(`${this.#flugzeugAlias}.id = :id`, { id: id }); // eslint-disable-line object-shorthand
        return queryBuilder;
    }

    /**
     * Bücher asynchron suchen.
     * @param suchkriterien JSON-Objekt mit Suchkriterien
     * @returns QueryBuilder
     */
    // z.B. { titel: 'a', rating: 5, javascript: true }
    // "rest properties" fuer anfaengliche WHERE-Klausel: ab ES 2018 https://github.com/tc39/proposal-object-rest-spread
    build({ modell, ...props }: Suchkriterien) {
        this.#logger.debug('build: modell=%s, props=%o', modell, props);

        let queryBuilder = this.#repo.createQueryBuilder(this.#flugzeugAlias);
        // eslint-disable-next-line prettier/prettier
        queryBuilder.innerJoinAndSelect(`${this.#flugzeugAlias}.modell`, 'modell');

        // z.B. { titel: 'a', rating: 5, javascript: true }
        // "rest properties" fuer anfaengliche WHERE-Klausel: ab ES 2018 https://github.com/tc39/proposal-object-rest-spread
        // type-coverage:ignore-next-line
        // const { titel, javascript, typescript, ...props } = suchkriterien;

        let useWhere = true;

        // Titel in der Query: Teilstring des Titels und "case insensitive"
        // CAVEAT: MySQL hat keinen Vergleich mit "case insensitive"
        // type-coverage:ignore-next-line
        if (modell !== undefined && typeof modell === 'string') {
            const ilike =
                typeOrmModuleOptions.type === 'postgres' ? 'ilike' : 'like';
            queryBuilder = queryBuilder.where(
                `${this.#modellAlias}.titel ${ilike} :titel`,
                { modell: `%${modell}%` },
            );
            useWhere = false;
        }

        // Restliche Properties als Key-Value-Paare: Vergleiche auf Gleichheit
        Object.keys(props).forEach((key) => {
            const param: Record<string, any> = {};
            param[key] = (props as Record<string, any>)[key]; // eslint-disable-line @typescript-eslint/no-unsafe-assignment, security/detect-object-injection
            queryBuilder = useWhere
                ? queryBuilder.where(
                      `${this.#flugzeugAlias}.${key} = :${key}`,
                      param,
                  )
                : queryBuilder.andWhere(
                      `${this.#flugzeugAlias}.${key} = :${key}`,
                      param,
                  );
            useWhere = false;
        });

        this.#logger.debug('build: sql=%s', queryBuilder.getSql());
        return queryBuilder;
    }
}

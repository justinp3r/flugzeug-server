/*
 * Copyright (C) 2016 - present Juergen Zimmermann, Florian Goebel, Hochschule Karlsruhe
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

// Nest unterstützt verschiedene Werkzeuge fuer OR-Mapping
// https://docs.nestjs.com/techniques/database
//  * TypeORM     https://typeorm.io
//  * Sequelize   https://sequelize.org
//  * Knex        https://knexjs.org

// TypeORM unterstützt die Patterns
//  * "Data Mapper" und orientiert sich an Hibernate (Java), Doctrine (PHP) und Entity Framework (C#)
//  * "Active Record" und orientiert sich an Mongoose (JavaScript)

// TypeORM unterstützt u.a. die DB-Systeme
//  * Postgres
//  * MySQL
//  * SQLite durch sqlite3 und better-sqlite3
//  * Oracle
//  * Microsoft SQL Server
//  * SAP Hana
//  * Cloud Spanner von Google

/**
 * Das Modul besteht aus der Entity-Klasse.
 * @packageDocumentation
 */

import {
    Column,
    CreateDateColumn,
    Entity,
    OneToMany,
    OneToOne,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
    VersionColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { DecimalTransformer } from './decimal-transformer.js';
import { Modell } from './modell.entity.js';
import { Sitzplatz } from './sitzplatz.entity.js';
import { dbType } from '../../config/db.js';

/**
 * Entity-Klasse zu einem relationalen Tabelle
 */
// https://typeorm.io/entities
@Entity()
export class Flugzeug {
    // https://typeorm.io/entities#primary-columns
    // default: strategy = 'increment' (SEQUENCE, GENERATED ALWAYS AS IDENTITY, AUTO_INCREMENT)
    @PrimaryGeneratedColumn()
    id: number | undefined;

    @VersionColumn()
    readonly version: number | undefined;

    @Column('decimal', {
        precision: 8,
        scale: 2,
        transformer: new DecimalTransformer(),
    })
    @ApiProperty({ example: 1, type: Number })
    // statt number ggf. Decimal aus decimal.js analog zu BigDecimal von Java
    readonly preis!: number;

    @Column('decimal') // TypeORM unterstuetzt bei Oracle *NICHT* den Typ boolean
    @ApiProperty({ example: true, type: Boolean })
    readonly einsatzbereit: boolean | undefined;

    @Column('date')
    @ApiProperty({ example: '2021-01-31' })
    // TypeORM unterstuetzt *NICHT* das Temporal-API (ES2022)
    readonly baujahr: Date | string | undefined;

    // undefined wegen Updates
    @OneToOne(() => Modell, (modell) => modell.flugzeug, {
        cascade: ['insert', 'remove'],
    })
    readonly modell: Modell | undefined;

    // undefined wegen Updates
    @OneToMany(() => Sitzplatz, (sitzplatz) => sitzplatz.flugzeug, {
        cascade: ['insert', 'remove'],
    })
    readonly sitzplaetze: Sitzplatz[] | undefined;

    @CreateDateColumn({
        type: dbType === 'sqlite' ? 'datetime' : 'timestamp',
    })
    readonly erzeugt: Date | undefined;

    @UpdateDateColumn({
        type: dbType === 'sqlite' ? 'datetime' : 'timestamp',
    })
    readonly aktualisiert: Date | undefined;

    public toString = (): string =>
        JSON.stringify({
            id: this.id,
            version: this.version,
            preis: this.preis,
            einsatzbereit: this.einsatzbereit,
            baujahr: this.baujahr,
            erzeugt: this.erzeugt,
            aktualisiert: this.aktualisiert,
        });
}

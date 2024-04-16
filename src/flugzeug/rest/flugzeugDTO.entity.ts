/* eslint-disable max-classes-per-file */
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

/**
 * Das Modul besteht aus der Entity-Klasse.
 * @packageDocumentation
 */

import {
    IsArray,
    IsBoolean,
    IsISO8601,
    IsOptional,
    IsPositive,
    ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ModellDTO } from './modellDTO.entity.js';
import { SitzplatzDTO } from './sitzplatzDTO.entity.js';
import { Type } from 'class-transformer';

export const MAX_RATING = 5;

/**
 * Entity-Klasse für Bücher ohne TypeORM und ohne Referenzen.
 */
export class FlugzeugDtoOhneRef {
    @IsPositive()
    @ApiProperty({ example: 1, type: Number })
    // statt number ggf. Decimal aus decimal.js analog zu BigDecimal von Java
    readonly preis!: number;

    @IsBoolean()
    @ApiProperty({ example: true, type: Boolean })
    readonly einsatzbereit: boolean | undefined;

    @IsISO8601({ strict: true })
    @IsOptional()
    @ApiProperty({ example: '2021-01-31' })
    readonly baujahr: Date | string | undefined;
}

/**
 * Entity-Klasse für Flugzeuge ohne TypeORM.
 */
export class FlugzeugDTO extends FlugzeugDtoOhneRef {
    @ValidateNested()
    @Type(() => ModellDTO)
    @ApiProperty({ type: ModellDTO })
    readonly modell!: ModellDTO; // NOSONAR

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => SitzplatzDTO)
    @ApiProperty({ type: [SitzplatzDTO] })
    readonly sitzplaetze: SitzplatzDTO[] | undefined;
}
/* eslint-enable max-classes-per-file */

// eslint-disable-next-line @eslint-community/eslint-comments/disable-enable-pair
/* eslint-disable sort-imports */
/*
 * Copyright (C) 2021 - present Juergen Zimmermann, Hochschule Karlsruhe
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
// eslint-disable-next-line max-classes-per-file
import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { AuthGuard, Roles } from 'nest-keycloak-connect';
import { IsInt, IsNumberString, Min } from 'class-validator';
import { UseFilters, UseGuards, UseInterceptors } from '@nestjs/common';
import { type Sitzplatz } from '../entity/sitzplatz.entity.js';
import { type Flugzeug } from '../entity/flugzeug.entity.js';
import { FlugzeugDTO } from '../rest/flugzeugDTO.entity.js';
import { FlugzeugWriteService } from '../service/flugzeug-write.service.js';
import { HttpExceptionFilter } from './http-exception.filter.js';
import { type IdInput } from './flugzeug-query.resolver.js';
import { type Modell } from '../entity/modell.entity.js';
import { ResponseTimeInterceptor } from '../../logger/response-time.interceptor.js';
import { getLogger } from '../../logger/logger.js';

// Authentifizierung und Autorisierung durch
//  GraphQL Shield
//      https://www.graphql-shield.com
//      https://github.com/maticzav/graphql-shield
//      https://github.com/nestjs/graphql/issues/92
//      https://github.com/maticzav/graphql-shield/issues/213
//  GraphQL AuthZ
//      https://github.com/AstrumU/graphql-authz
//      https://www.the-guild.dev/blog/graphql-authz

export interface CreatePayload {
    readonly id: number;
}

export interface UpdatePayload {
    readonly version: number;
}

export class FlugzeugUpdateDTO extends FlugzeugDTO {
    @IsNumberString()
    readonly id!: string;

    @IsInt()
    @Min(0)
    readonly version!: number;
}
@Resolver()
// alternativ: globale Aktivierung der Guards https://docs.nestjs.com/security/authorization#basic-rbac-implementation
@UseGuards(AuthGuard)
@UseFilters(HttpExceptionFilter)
@UseInterceptors(ResponseTimeInterceptor)
export class FlugzeugMutationResolver {
    readonly #service: FlugzeugWriteService;

    readonly #logger = getLogger(FlugzeugMutationResolver.name);

    constructor(service: FlugzeugWriteService) {
        this.#service = service;
    }

    @Mutation()
    @Roles({ roles: ['admin', 'user'] })
    async create(@Args('input') flugzeugDTO: FlugzeugDTO) {
        this.#logger.debug('create: FlugzeugDTO=%o', flugzeugDTO);

        const flugzeug = this.#flugzeugDtoToFlugzeug(flugzeugDTO);
        const id = await this.#service.create(flugzeug);
        this.#logger.debug('createFlugzeug: id=%d', id);
        const payload: CreatePayload = { id };
        return payload;
    }

    @Mutation()
    @Roles({ roles: ['admin', 'user'] })
    async update(@Args('input') flugzeugDTO: FlugzeugUpdateDTO) {
        this.#logger.debug('update: flugzeug=%o', flugzeugDTO);

        const flugzeug = this.#flugzeugUpdateDtoToFlugzeug(flugzeugDTO);
        const versionStr = `"${flugzeugDTO.version.toString()}"`;

        const versionResult = await this.#service.update({
            id: Number.parseInt(flugzeugDTO.id, 10),
            flugzeug,
            version: versionStr,
        });
        // TODO BadUserInputError
        this.#logger.debug('updateFlugzeug: versionResult=%d', versionResult);
        const payload: UpdatePayload = { version: versionResult };
        return payload;
    }

    @Mutation()
    @Roles({ roles: ['admin'] })
    async delete(@Args() id: IdInput) {
        const idStr = id.id;
        this.#logger.debug('delete: id=%s', idStr);
        const deletePerformed = await this.#service.delete(idStr);
        // eslint-disable-next-line prettier/prettier
        this.#logger.debug('deleteFlugzeug: deletePerformed=%s', deletePerformed);
        return deletePerformed;
    }

    #flugzeugDtoToFlugzeug(flugzeugDTO: FlugzeugDTO): Flugzeug {
        const modellDTO = flugzeugDTO.modell;
        const modell: Modell = {
            id: undefined,
            modell: modellDTO.modell,
            flugzeug: undefined,
        };
        const sitzplaetze = flugzeugDTO.sitzplaetze?.map((sitzplatzDTO) => {
            const sitzplatz: Sitzplatz = {
                id: undefined,
                sitzplatzklasse: sitzplatzDTO.sitzplatzklasse,
                flugzeug: undefined,
            };
            return sitzplatz;
        });
        const flugzeug: Flugzeug = {
            id: undefined,
            version: undefined,
            preis: flugzeugDTO.preis,
            einsatzbereit: flugzeugDTO.einsatzbereit,
            baujahr: flugzeugDTO.baujahr,
            modell,
            sitzplaetze,
            erzeugt: new Date(),
            aktualisiert: new Date(),
        };

        // Rueckwaertsverweis
        flugzeug.modell!.flugzeug = flugzeug;
        return flugzeug;
    }

    #flugzeugUpdateDtoToFlugzeug(flugzeugDTO: FlugzeugUpdateDTO): Flugzeug {
        return {
            id: undefined,
            version: undefined,
            preis: flugzeugDTO.preis,
            einsatzbereit: flugzeugDTO.einsatzbereit,
            baujahr: flugzeugDTO.baujahr,
            modell: undefined,
            sitzplaetze: undefined,
            erzeugt: undefined,
            aktualisiert: new Date(),
        };
    }

    // #errorMsgCreateFlugzeug(err: CreateError) {
    //     switch (err.type) {
    //         case 'IsbnExists': {
    //             return `Die ISBN ${err.isbn} existiert bereits`;
    //         }
    //         default: {
    //             return 'Unbekannter Fehler';
    //         }
    //     }
    // }

    // #errorMsgUpdateFlugzeug(err: UpdateError) {
    //     switch (err.type) {
    //         case 'FlugzeugNotExists': {
    //             return `Es gibt kein Flugzeug mit der ID ${err.id}`;
    //         }
    //         case 'VersionInvalid': {
    //             return `"${err.version}" ist keine gueltige Versionsnummer`;
    //         }
    //         case 'VersionOutdated': {
    //             return `Die Versionsnummer "${err.version}" ist nicht mehr aktuell`;
    //         }
    //         default: {
    //             return 'Unbekannter Fehler';
    //         }
    //     }
    // }
}

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

/**
 * Das Modul besteht aus der Controller-Klasse für Schreiben an der REST-Schnittstelle.
 * @packageDocumentation
 */

import {
    ApiBadRequestResponse,
    ApiBearerAuth,
    ApiCreatedResponse,
    ApiForbiddenResponse,
    ApiHeader,
    ApiNoContentResponse,
    ApiOperation,
    ApiPreconditionFailedResponse,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';
import { AuthGuard, Roles } from 'nest-keycloak-connect';
import {
    Body,
    Controller,
    Delete,
    Headers,
    HttpCode,
    HttpStatus,
    Param,
    Post,
    Put,
    Req,
    Res,
    UseGuards,
    UseInterceptors,
} from '@nestjs/common';
import { FlugzeugDTO, FlugzeugDtoOhneRef } from './flugzeugDTO.entity.js';
import { Request, Response } from 'express';
import { FlugzeugWriteService } from '../service/flugzeug-write.service.js';
import { getBaseUri } from './getBaseUri.js';
import { getLogger } from '../../logger/logger.js';
import { paths } from '../../config/paths.js';
// eslint-disable-next-line sort-imports
import { type Flugzeug } from '../entity/flugzeug.entity.js';
import { type Modell } from '../entity/modell.entity.js';
import { ResponseTimeInterceptor } from '../../logger/response-time.interceptor.js';
import { type Sitzplatz } from '../entity/sitzplatz.entity.js';

const MSG_FORBIDDEN = 'Kein Token mit ausreichender Berechtigung vorhanden';
/**
 * Die Controller-Klasse für die Verwaltung von Flugzeugen.
 */
@Controller(paths.rest)
@UseGuards(AuthGuard)
@UseInterceptors(ResponseTimeInterceptor)
@ApiTags('Flugzeug REST-API')
@ApiBearerAuth()
export class FlugzeugWriteController {
    readonly #service: FlugzeugWriteService;

    readonly #logger = getLogger(FlugzeugWriteController.name);

    constructor(service: FlugzeugWriteService) {
        this.#service = service;
    }

    /**
     * Ein neues Flugzeug wird asynchron angelegt. Das neu anzulegende Flugzeug ist als
     * JSON-Datensatz im Request-Objekt enthalten. Wenn es keine
     * Verletzungen von Constraints gibt, wird der Statuscode `201` (`Created`)
     * gesetzt und im Response-Header wird `Location` auf die URI so gesetzt,
     * dass damit das neu angelegte Flugzeug abgerufen werden kann.
     *
     * Falls Constraints verletzt sind, wird der Statuscode `400` (`Bad Request`)
     * gesetzt und genauso auch wenn das Modell bereits
     * existieren.
     *
     * @param flugzeugDTO JSON-Daten für ein Flugzeug im Request-Body.
     * @param res Leeres Response-Objekt von Express.
     * @returns Leeres Promise-Objekt.
     */
    @Post()
    @Roles({ roles: ['admin', 'user'] })
    @ApiOperation({ summary: 'Ein neues Flugzeug anlegen' })
    @ApiCreatedResponse({ description: 'Erfolgreich neu angelegt' })
    @ApiBadRequestResponse({ description: 'Fehlerhafte Flugzeugdaten' })
    @ApiForbiddenResponse({ description: MSG_FORBIDDEN })
    async post(
        @Body() flugzeugDTO: FlugzeugDTO,
        @Req() req: Request,
        @Res() res: Response,
    ): Promise<Response> {
        this.#logger.debug('post: flugzeugDTO=%o', flugzeugDTO);

        const flugzeug = this.#flugzeugDtoToFlugzeug(flugzeugDTO);
        const id = await this.#service.create(flugzeug);

        const location = `${getBaseUri(req)}/${id}`;
        this.#logger.debug('post: location=%s', location);
        return res.location(location).send();
    }

    /**
     * Ein vorhandenes Flugzeug wird asynchron aktualisiert.
     *
     * Im Request-Objekt von Express muss die ID des zu aktualisierenden Flugzeuges
     * als Pfad-Parameter enthalten sein. Außerdem muss im Rumpf das zu
     * aktualisierende Flugzeug als JSON-Datensatz enthalten sein. Damit die
     * Aktualisierung überhaupt durchgeführt werden kann, muss im Header
     * `If-Match` auf die korrekte Version für optimistische Synchronisation
     * gesetzt sein.
     *
     * Bei erfolgreicher Aktualisierung wird der Statuscode `204` (`No Content`)
     * gesetzt und im Header auch `ETag` mit der neuen Version mitgeliefert.
     *
     * Falls die Versionsnummer fehlt, wird der Statuscode `428` (`Precondition
     * required`) gesetzt; und falls sie nicht korrekt ist, der Statuscode `412`
     * (`Precondition failed`). Falls Constraints verletzt sind, wird der
     * Statuscode `400` (`Bad Request`) gesetzt und genauso auch wenn das neue
     * Modell bereits existieren.
     *
     * @param flugzeugDTO Flugzeugdaten im Body des Request-Objekts.
     * @param id Pfad-Paramater für die ID.
     * @param version Versionsnummer aus dem Header _If-Match_.
     * @param res Leeres Response-Objekt von Express.
     * @returns Leeres Promise-Objekt.
     */
    // eslint-disable-next-line max-params
    @Put(':id')
    @Roles({ roles: ['admin', 'user'] })
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({
        summary: 'Ein vorhandenes Flugzeug aktualisieren',
        tags: ['Aktualisieren'],
    })
    @ApiHeader({
        name: 'If-Match',
        description: 'Header für optimistische Synchronisation',
        required: false,
    })
    @ApiNoContentResponse({ description: 'Erfolgreich aktualisiert' })
    @ApiBadRequestResponse({ description: 'Fehlerhafte Flugzeugdaten' })
    @ApiPreconditionFailedResponse({
        description: 'Falsche Version im Header "If-Match"',
    })
    @ApiResponse({
        status: HttpStatus.PRECONDITION_REQUIRED,
        description: 'Header "If-Match" fehlt',
    })
    @ApiForbiddenResponse({ description: MSG_FORBIDDEN })
    async put(
        @Body() flugzeugDTO: FlugzeugDtoOhneRef,
        @Param('id') id: number,
        @Headers('If-Match') version: string | undefined,
        @Res() res: Response,
    ): Promise<Response> {
        this.#logger.debug(
            'put: id=%s, flugzeugDTO=%o, version=%s',
            id,
            flugzeugDTO,
            version,
        );

        if (version === undefined) {
            const msg = 'Header "If-Match" fehlt';
            this.#logger.debug('put: msg=%s', msg);
            return res
                .status(HttpStatus.PRECONDITION_REQUIRED)
                .set('Content-Type', 'application/json')
                .send(msg);
        }

        const flugzeug = this.#flugzeugDtoOhneRefToFlugzeug(flugzeugDTO);
        const neueVersion = await this.#service.update({
            id,
            flugzeug,
            version,
        });
        this.#logger.debug('put: version=%d', neueVersion);
        return res.header('ETag', `"${neueVersion}"`).send();
    }

    /**
     * Ein Flugzeug wird anhand seiner ID-gelöscht, die als Pfad-Parameter angegeben
     * ist. Der zurückgelieferte Statuscode ist `204` (`No Content`).
     *
     * @param id Pfad-Paramater für die ID.
     * @returns Leeres Promise-Objekt.
     */
    @Delete(':id')
    @Roles({ roles: ['admin'] })
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Flugzeug mit der ID löschen' })
    @ApiNoContentResponse({
        description: 'Das Flugzeug wurde gelöscht oder war nicht vorhanden',
    })
    @ApiForbiddenResponse({ description: MSG_FORBIDDEN })
    async delete(@Param('id') id: number) {
        this.#logger.debug('delete: id=%s', id);
        await this.#service.delete(id);
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
        const flugzeug = {
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

        // Rueckwaertsverweise
        flugzeug.modell.flugzeug = flugzeug;
        flugzeug.sitzplaetze?.forEach((sitzplatz) => {
            sitzplatz.flugzeug = flugzeug;
        });
        return flugzeug;
    }

    #flugzeugDtoOhneRefToFlugzeug(flugzeugDTO: FlugzeugDtoOhneRef): Flugzeug {
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
}

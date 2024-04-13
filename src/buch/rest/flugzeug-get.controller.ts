/* eslint-disable max-lines */
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
 * Das Modul besteht aus der Controller-Klasse für Lesen an der REST-Schnittstelle.
 * @packageDocumentation
 */

// eslint-disable-next-line max-classes-per-file
import {
    ApiHeader,
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiProperty,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';
import {
    Controller,
    Get,
    Headers,
    HttpStatus,
    NotFoundException,
    Param,
    Query,
    Req,
    Res,
    UseInterceptors,
} from '@nestjs/common';

import { Request, Response } from 'express';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { Flugzeug } from '../entity/flugzeug.entity.js';
import { FlugzeugReadService } from '../service/flugzeug-read.service.js';
import { type Modell } from '../entity/modell.entity.js';
import { Public } from 'nest-keycloak-connect';
import { ResponseTimeInterceptor } from '../../logger/response-time.interceptor.js';
import { type Suchkriterien } from '../service/suchkriterien.js';
import { getBaseUri } from './getBaseUri.js';
import { getLogger } from '../../logger/logger.js';
import { paths } from '../../config/paths.js';
/** href-Link für HATEOAS */
export interface Link {
    /** href-Link für HATEOAS-Links */
    readonly href: string;
}

/** Links für HATEOAS */
export interface Links {
    /** self-Link */
    readonly self: Link;
    /** Optionaler Linke für list */
    readonly list?: Link;
    /** Optionaler Linke für add */
    readonly add?: Link;
    /** Optionaler Linke für update */
    readonly update?: Link;
    /** Optionaler Linke für remove */
    readonly remove?: Link;
}

/** Typedefinition für ein Titel-Objekt ohne Rückwärtsverweis zum Flugzeug */
export type ModellModel = Omit<Modell, 'flugzeug' | 'id'>;

/** Flugzeug-Objekt mit HATEOAS-Links */
export type FlugzeugModel = Omit<
    Flugzeug,
    'sitzplaetze' | 'aktualisiert' | 'erzeugt' | 'id' | 'modell' | 'version'
> & {
    modell: ModellModel;
    // eslint-disable-next-line @typescript-eslint/naming-convention
    _links: Links;
};

/** Flugzeug-Objekte mit HATEOAS-Links in einem JSON-Array. */
export interface FlugzeugeModel {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    _embedded: {
        flugzeuge: FlugzeugModel[];
    };
}

/**
 * Klasse für `FlugzeugGetController`, um Queries in _OpenAPI_ bzw. Swagger zu
 * formulieren. `FlugzeugController` hat dieselben Properties wie die Basisklasse
 * `Flugzeug` - allerdings mit dem Unterschied, dass diese Properties beim Ableiten
 * so überschrieben sind, dass sie auch nicht gesetzt bzw. undefined sein
 * dürfen, damit die Queries flexibel formuliert werden können. Deshalb ist auch
 * immer der zusätzliche Typ undefined erforderlich.
 * Außerdem muss noch `string` statt `Date` verwendet werden, weil es in OpenAPI
 * den Typ Date nicht gibt.
 */
export class FlugzeugQuery implements Suchkriterien {
    @ApiProperty({ required: false })
    declare readonly preis: number;

    @ApiProperty({ required: false })
    declare readonly einsatzbereit: boolean;

    @ApiProperty({ required: false })
    declare readonly baujahr: string;

    @ApiProperty({ required: false })
    declare readonly modell: string;
}

const APPLICATION_HAL_JSON = 'application/hal+json';

/**
 * Die Controller-Klasse für die Verwaltung von Bücher.
 */
// Decorator in TypeScript, zur Standardisierung in ES vorgeschlagen (stage 3)
// https://devblogs.microsoft.com/typescript/announcing-typescript-5-0-beta/#decorators
// https://github.com/tc39/proposal-decorators
@Controller(paths.rest)
@UseInterceptors(ResponseTimeInterceptor)
@ApiTags('Flugzeug REST-API')
// @ApiBearerAuth()
// Klassen ab ES 2015
export class FlugzeugGetController {
    // readonly in TypeScript, vgl. C#
    // private ab ES 2019
    readonly #service: FlugzeugReadService;

    readonly #logger = getLogger(FlugzeugGetController.name);

    // Dependency Injection (DI) bzw. Constructor Injection
    // constructor(private readonly service: FlugzeugReadService) {}
    // https://github.com/tc39/proposal-type-annotations#omitted-typescript-specific-features-that-generate-code
    constructor(service: FlugzeugReadService) {
        this.#service = service;
    }

    /**
     * Ein Flugzeug wird asynchron anhand seiner ID als Pfadparameter gesucht.
     *
     * Falls es ein solches Flugzeug gibt und `If-None-Match` im Request-Header
     * auf die aktuelle Version des Flugzeuges gesetzt war, wird der Statuscode
     * `304` (`Not Modified`) zurückgeliefert. Falls `If-None-Match` nicht
     * gesetzt ist oder eine veraltete Version enthält, wird das gefundene
     * Flugzeug im Rumpf des Response als JSON-Datensatz mit Atom-Links für HATEOAS
     * und dem Statuscode `200` (`OK`) zurückgeliefert.
     *
     * Falls es kein Flugzeug zur angegebenen ID gibt, wird der Statuscode `404`
     * (`Not Found`) zurückgeliefert.
     *
     * @param idStr Pfad-Parameter `id`
     * @param req Request-Objekt von Express mit Pfadparameter, Query-String,
     *            Request-Header und Request-Body.
     * @param version Versionsnummer im Request-Header bei `If-None-Match`
     * @param res Leeres Response-Objekt von Express.
     * @returns Leeres Promise-Objekt.
     */
    // eslint-disable-next-line max-params
    @Get(':id')
    @Public()
    @ApiOperation({ summary: 'Suche mit der Flugzeug-ID' })
    @ApiParam({
        name: 'id',
        description: 'Z.B. 1',
    })
    @ApiHeader({
        name: 'If-None-Match',
        description: 'Header für bedingte GET-Requests, z.B. "0"',
        required: false,
    })
    @ApiOkResponse({ description: 'Das Flugzeug wurde gefunden' })
    @ApiNotFoundResponse({ description: 'Kein Flugzeug zur ID gefunden' })
    @ApiResponse({
        status: HttpStatus.NOT_MODIFIED,
        description: 'Das Flugzeug wurde bereits heruntergeladen',
    })
    async getById(
        @Param('id') idStr: string,
        @Req() req: Request,
        @Headers('If-None-Match') version: string | undefined,
        @Res() res: Response,
    ): Promise<Response<FlugzeugModel | undefined>> {
        this.#logger.debug('getById: idStr=%s, version=%s', idStr, version);
        const id = Number(idStr);
        if (!Number.isInteger(id)) {
            this.#logger.debug('getById: not isInteger()');
            // eslint-disable-next-line prettier/prettier
            throw new NotFoundException(`Die Flugzeug-ID ${idStr} ist ungueltig.`);
        }

        if (req.accepts([APPLICATION_HAL_JSON, 'json', 'html']) === false) {
            this.#logger.debug('getById: accepted=%o', req.accepted);
            return res.sendStatus(HttpStatus.NOT_ACCEPTABLE);
        }

        const flugzeug = await this.#service.findById({ id });
        if (this.#logger.isLevelEnabled('debug')) {
            this.#logger.debug('getById(): flugzeug=%s', flugzeug.toString());
            this.#logger.debug('getById(): modell=%o', flugzeug.modell);
        }

        // ETags
        const versionDb = flugzeug.version;
        if (version === `"${versionDb}"`) {
            this.#logger.debug('getById: NOT_MODIFIED');
            return res.sendStatus(HttpStatus.NOT_MODIFIED);
        }
        this.#logger.debug('getById: versionDb=%s', versionDb);
        res.header('ETag', `"${versionDb}"`);

        // HATEOAS mit Atom Links und HAL (= Hypertext Application Language)
        const flugzeugModel = this.#toModel(flugzeug, req);
        this.#logger.debug('getById: flugzeugModel=%o', flugzeugModel);
        return res.contentType(APPLICATION_HAL_JSON).json(flugzeugModel);
    }

    /**
     * Bücher werden mit Query-Parametern asynchron gesucht. Falls es mindestens
     * ein solches Flugzeug gibt, wird der Statuscode `200` (`OK`) gesetzt. Im Rumpf
     * des Response ist das JSON-Array mit den gefundenen Büchern, die jeweils
     * um Atom-Links für HATEOAS ergänzt sind.
     *
     * Falls es kein Flugzeug zu den Suchkriterien gibt, wird der Statuscode `404`
     * (`Not Found`) gesetzt.
     *
     * Falls es keine Query-Parameter gibt, werden alle Bücher ermittelt.
     *
     * @param query Query-Parameter von Express.
     * @param req Request-Objekt von Express.
     * @param res Leeres Response-Objekt von Express.
     * @returns Leeres Promise-Objekt.
     */
    @Get()
    @Public()
    @ApiOperation({ summary: 'Suche mit Suchkriterien' })
    @ApiOkResponse({ description: 'Eine evtl. leere Liste mit Büchern' })
    async get(
        @Query() query: FlugzeugQuery,
        @Req() req: Request,
        @Res() res: Response,
    ): Promise<Response<FlugzeugeModel | undefined>> {
        this.#logger.debug('get: query=%o', query);

        if (req.accepts([APPLICATION_HAL_JSON, 'json', 'html']) === false) {
            this.#logger.debug('get: accepted=%o', req.accepted);
            return res.sendStatus(HttpStatus.NOT_ACCEPTABLE);
        }

        const buecher = await this.#service.find(query);
        this.#logger.debug('get: %o', buecher);

        // HATEOAS: Atom Links je Flugzeug
        const flugzeugeModel = buecher.map((flugzeug) =>
            this.#toModel(flugzeug, req, false),
        );
        this.#logger.debug('get: buecherModel=%o', flugzeugeModel);

        // eslint-disable-next-line prettier/prettier
        const result: FlugzeugeModel = { _embedded: { flugzeuge: flugzeugeModel } };
        return res.contentType(APPLICATION_HAL_JSON).json(result).send();
    }

    #toModel(flugzeug: Flugzeug, req: Request, all = true) {
        const baseUri = getBaseUri(req);
        this.#logger.debug('#toModel: baseUri=%s', baseUri);
        const { id } = flugzeug;
        const links = all
            ? {
                  self: { href: `${baseUri}/${id}` },
                  list: { href: `${baseUri}` },
                  add: { href: `${baseUri}` },
                  update: { href: `${baseUri}/${id}` },
                  remove: { href: `${baseUri}/${id}` },
              }
            : { self: { href: `${baseUri}/${id}` } };

        this.#logger.debug('#toModel: flugzeug=%o, links=%o', flugzeug, links);
        const modellModel: ModellModel = {
            modell: flugzeug.modell?.modell ?? 'N/A',
        };
        const flugzeugModel: FlugzeugModel = {
            preis: flugzeug.preis,
            einsatzbereit: flugzeug.einsatzbereit,
            baujahr: flugzeug.baujahr,
            modell: modellModel,
            _links: links,
        };

        return flugzeugModel;
    }
}
/* eslint-enable max-lines */

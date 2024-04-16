/* eslint-disable no-underscore-dangle */
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

import { afterAll, beforeAll, describe, test } from '@jest/globals';
import axios, { type AxiosInstance, type AxiosResponse } from 'axios';
import {
    host,
    httpsAgent,
    port,
    shutdownServer,
    startServer,
} from '../testserver.js';
import { type ErrorResponse } from './error-response.js';
import { type FlugzeugeModel } from '../../src/flugzeug/rest/flugzeug-get.controller.js';
import { HttpStatus } from '@nestjs/common';

// -----------------------------------------------------------------------------
// T e s t d a t e n
// -----------------------------------------------------------------------------
const modellVorhanden = 'a';
const modellNichtVorhanden = 'xx';

// -----------------------------------------------------------------------------
// T e s t s
// -----------------------------------------------------------------------------
// Test-Suite
// eslint-disable-next-line max-lines-per-function
describe('GET /rest', () => {
    let baseURL: string;
    let client: AxiosInstance;

    beforeAll(async () => {
        await startServer();
        baseURL = `https://${host}:${port}/rest`;
        client = axios.create({
            baseURL,
            httpsAgent,
            validateStatus: () => true,
        });
    });

    afterAll(async () => {
        await shutdownServer();
    });

    test('Alle Flugzeuge', async () => {
        // given

        // when
        const { status, headers, data }: AxiosResponse<FlugzeugeModel> =
            await client.get('/');

        // then
        expect(status).toBe(HttpStatus.OK);
        expect(headers['content-type']).toMatch(/json/iu);
        expect(data).toBeDefined();

        const { flugzeuge } = data._embedded;

        flugzeuge
            .map((flugzeug) => flugzeug._links.self.href)
            .forEach((selfLink) => {
                // eslint-disable-next-line security/detect-non-literal-regexp, security-node/non-literal-reg-expr
                expect(selfLink).toMatch(new RegExp(`^${baseURL}`, 'iu'));
            });
    });

    test('Flugzeuge mit einem Teil-Titel suchen', async () => {
        // given
        const params = { modell: modellVorhanden };

        // when
        const { status, headers, data }: AxiosResponse<FlugzeugeModel> =
            await client.get('/', { params });

        // then
        expect(status).toBe(HttpStatus.OK);
        expect(headers['content-type']).toMatch(/json/iu);
        expect(data).toBeDefined();

        const { flugzeuge } = data._embedded;

        // Jedes Buch hat einen Titel mit dem Teilstring 'a'
        flugzeuge
            .map((flugzeug) => flugzeug.modell)
            .forEach((modell) =>
                expect(modell.modell.toLowerCase()).toEqual(
                    expect.stringContaining(modellVorhanden),
                ),
            );
    });

    test('Flugzeuge zu einem nicht vorhandenen Teil-Modell suchen', async () => {
        // given
        const params = { modell: modellNichtVorhanden };

        // when
        const { status, data }: AxiosResponse<ErrorResponse> = await client.get(
            '/',
            { params },
        );

        // then
        expect(status).toBe(HttpStatus.NOT_FOUND);

        const { error, statusCode } = data;

        expect(error).toBe('Not Found');
        expect(statusCode).toBe(HttpStatus.NOT_FOUND);
    });

    test('Keine Flugzeuge zu einer nicht-vorhandenen Property', async () => {
        // given
        const params = { foo: 'bar' };

        // when
        const { status, data }: AxiosResponse<ErrorResponse> = await client.get(
            '/',
            { params },
        );

        // then
        expect(status).toBe(HttpStatus.NOT_FOUND);

        const { error, statusCode } = data;

        expect(error).toBe('Not Found');
        expect(statusCode).toBe(HttpStatus.NOT_FOUND);
    });
});
/* eslint-enable no-underscore-dangle */

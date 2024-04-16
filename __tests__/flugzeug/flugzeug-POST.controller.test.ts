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
import { type FlugzeugDTO } from '../../src/flugzeug/rest/flugzeugDTO.entity.js';
import { FlugzeugReadService } from '../../src/flugzeug/service/flugzeug-read.service.js';
import { HttpStatus } from '@nestjs/common';
import { loginRest } from '../login.js';

// -----------------------------------------------------------------------------
// T e s t d a t e n
// -----------------------------------------------------------------------------
const neuesFlugzeug: FlugzeugDTO = {
    preis: 99.99,
    einsatzbereit: true,
    baujahr: '2022-02-28',
    modell: {
        modell: 'Titelpost',
    },
    sitzplaetze: [
        {
            sitzplatzklasse: 'Klasse 1',
        },
    ],
};
const neuesFlugzeugInvalid: Record<string, unknown> = {
    preis: -1,
    einsatzbereit: true,
    baujahr: '12345-123-123',
    modell: {
        modell: '?!',
    },
};

// -----------------------------------------------------------------------------
// T e s t s
// -----------------------------------------------------------------------------
// Test-Suite
// eslint-disable-next-line max-lines-per-function
describe('POST /rest', () => {
    let client: AxiosInstance;
    const headers: Record<string, string> = {
        'Content-Type': 'application/json', // eslint-disable-line @typescript-eslint/naming-convention
    };

    // Testserver starten und dabei mit der DB verbinden
    beforeAll(async () => {
        await startServer();
        const baseURL = `https://${host}:${port}`;
        client = axios.create({
            baseURL,
            httpsAgent,
            validateStatus: (status) => status < 500, // eslint-disable-line @typescript-eslint/no-magic-numbers
        });
    });

    afterAll(async () => {
        await shutdownServer();
    });

    test('Neues Flugzeug', async () => {
        // given
        const token = await loginRest(client);
        headers.Authorization = `Bearer ${token}`;

        // when
        const response: AxiosResponse<string> = await client.post(
            '/rest',
            neuesFlugzeug,
            { headers },
        );

        // then
        const { status, data } = response;

        expect(status).toBe(HttpStatus.CREATED);

        const { location } = response.headers as { location: string };

        expect(location).toBeDefined();

        // ID nach dem letzten "/"
        const indexLastSlash: number = location.lastIndexOf('/');

        expect(indexLastSlash).not.toBe(-1);

        const idStr = location.slice(indexLastSlash + 1);

        expect(idStr).toBeDefined();
        expect(FlugzeugReadService.ID_PATTERN.test(idStr)).toBe(true);

        expect(data).toBe('');
    });

    test('Neues Flugzeug mit ungueltigen Daten', async () => {
        // given
        const token = await loginRest(client);
        headers.Authorization = `Bearer ${token}`;
        const expectedMsg = [
            expect.stringMatching(/^preis /u),
            expect.stringMatching(/^baujahr /u),
            expect.stringMatching(/^modell.modell /u),
        ];

        // when
        const response: AxiosResponse<Record<string, any>> = await client.post(
            '/rest',
            neuesFlugzeugInvalid,
            { headers },
        );

        // then
        const { status, data } = response;

        expect(status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const messages: string[] = data.message;

        expect(messages).toBeDefined();
        expect(messages).toHaveLength(expectedMsg.length);
        expect(messages).toEqual(expect.arrayContaining(expectedMsg));
    });

    test('Neues Flugzeug, aber ohne Token', async () => {
        // when
        const response: AxiosResponse<Record<string, any>> = await client.post(
            '/rest',
            neuesFlugzeug,
        );

        // then
        expect(response.status).toBe(HttpStatus.UNAUTHORIZED);
    });

    test('Neues Flugzeug, aber mit falschem Token', async () => {
        // given
        const token = 'FALSCH';
        headers.Authorization = `Bearer ${token}`;

        // when
        const response: AxiosResponse<Record<string, any>> = await client.post(
            '/rest',
            neuesFlugzeug,
            { headers },
        );

        // then
        expect(response.status).toBe(HttpStatus.UNAUTHORIZED);
    });

    test.todo('Abgelaufener Token');
});

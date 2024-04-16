// @eslint-community/eslint-disable-next-line eslint-comments/disable-enable-pair
/* eslint-disable max-lines */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
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

import { type Flugzeug, type FlugzeugArt } from '../../src/flugzeug/entity/flugzeug.entity.js';
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import axios, { type AxiosInstance, type AxiosResponse } from 'axios';
import {
    host,
    httpsAgent,
    port,
    shutdownServer,
    startServer,
} from '../testserver.js';
import { type GraphQLFormattedError } from 'graphql';
import { type GraphQLRequest } from '@apollo/server';
import { HttpStatus } from '@nestjs/common';

// eslint-disable-next-line jest/no-export
export interface GraphQLResponseBody {
    data?: Record<string, any> | null;
    errors?: readonly [GraphQLFormattedError];
}

type FlugzeugDTO = Omit<Flugzeug, 'sitzplaetze' | 'aktualisiert' | 'erzeugt'>;

// -----------------------------------------------------------------------------
// T e s t d a t e n
// -----------------------------------------------------------------------------
const idVorhanden = '1';

const modellVorhanden = 'Alpha';
const teilModellVorhanden = 'a';
const teilModellNichtVorhanden = 'abc';

// -----------------------------------------------------------------------------
// T e s t s
// -----------------------------------------------------------------------------
// Test-Suite
// eslint-disable-next-line max-lines-per-function
describe('GraphQL Queries', () => {
    let client: AxiosInstance;
    const graphqlPath = 'graphql';

    // Testserver starten und dabei mit der DB verbinden
    beforeAll(async () => {
        await startServer();
        const baseURL = `https://${host}:${port}/`;
        client = axios.create({
            baseURL,
            httpsAgent,
            // auch Statuscode 400 als gueltigen Request akzeptieren, wenn z.B.
            // ein Enum mit einem falschen String getestest wird
            validateStatus: () => true,
        });
    });

    afterAll(async () => {
        await shutdownServer();
    });

    test('Flugzeug zu vorhandener ID', async () => {
        // given
        const body: GraphQLRequest = {
            query: `
                {
                    flugzeug(id: "${idVorhanden}") {
                        version
                        preis
                        einsatzbereit
                        baujahr
                        modell {
                            modell
                        }
                    }
                }
            `,
        };

        // when
        const { status, headers, data }: AxiosResponse<GraphQLResponseBody> =
            await client.post(graphqlPath, body);

        // then
        expect(status).toBe(HttpStatus.OK);
        expect(headers['content-type']).toMatch(/json/iu); // eslint-disable-line sonarjs/no-duplicate-string
        expect(data.errors).toBeUndefined();
        expect(data.data).toBeDefined();

        const { flugzeug } = data.data!;
        const result: FlugzeugDTO = flugzeug;

        expect(result.modell?.modell).toMatch(/^\w/u);
        expect(result.version).toBeGreaterThan(-1);
        expect(result.id).toBeUndefined();
    });

    test('Flugzeug zu nicht-vorhandener ID', async () => {
        // given
        const id = '999999';
        const body: GraphQLRequest = {
            query: `
                {
                    flugzeug(id: "${id}") {
                        modell {
                            modell
                        }
                    }
                }
            `,
        };

        // when
        const { status, headers, data }: AxiosResponse<GraphQLResponseBody> =
            await client.post(graphqlPath, body);

        // then
        expect(status).toBe(HttpStatus.OK);
        expect(headers['content-type']).toMatch(/json/iu);
        expect(data.data!.fluzeug).toBeNull();

        const { errors } = data;

        expect(errors).toHaveLength(1);

        const [error] = errors!;
        const { message, path, extensions } = error;

        expect(message).toBe(`Es gibt kein Flugzeug mit der ID ${id}.`);
        expect(path).toBeDefined();
        expect(path![0]).toBe('flugzeug');
        expect(extensions).toBeDefined();
        expect(extensions!.code).toBe('BAD_USER_INPUT');
    });

    test('Flugzeug zu vorhandenem Modell', async () => {
        // given
        const body: GraphQLRequest = {
            query: `
                {
                    flugzeuge(suchkriterien: {
                        modell: "${modellVorhanden}"
                    }) {
                        modell {
                            modell
                        }
                    }
                }
            `,
        };

        // when
        const { status, headers, data }: AxiosResponse<GraphQLResponseBody> =
            await client.post(graphqlPath, body);

        // then
        expect(status).toBe(HttpStatus.OK);
        expect(headers['content-type']).toMatch(/json/iu);
        expect(data.errors).toBeUndefined();

        expect(data.data).toBeDefined();

        const { flugzeuge } = data.data!;

        expect(flugzeuge).not.toHaveLength(0);

        const flugzeugeArray: FlugzeugDTO[] = flugzeuge;

        expect(flugzeugeArray).toHaveLength(1);

        const [flugzeug] = flugzeugeArray;

        expect(flugzeug!.modell?.modell).toBe(modellVorhanden);
    });

    test('Flugzeug zu vorhandenem Teil-Modell', async () => {
        // given
        const body: GraphQLRequest = {
            query: `
                {
                    flugzeuge(suchkriterien: {
                        modell: "${teilModellVorhanden}"
                    }) {
                        modell {
                            modell
                        }
                    }
                }
            `,
        };

        // when
        const { status, headers, data }: AxiosResponse<GraphQLResponseBody> =
            await client.post(graphqlPath, body);

        // then
        expect(status).toBe(HttpStatus.OK);
        expect(headers['content-type']).toMatch(/json/iu);
        expect(data.errors).toBeUndefined();
        expect(data.data).toBeDefined();

        const { flugzeuge } = data.data!;

        expect(flugzeuge).not.toHaveLength(0);

        const flugzeugeArray: FlugzeugDTO[] = flugzeuge;
        flugzeugeArray
            .map((flugzeug) => flugzeug.modell)
            .forEach((modell) =>
                expect(modell?.modell.toLowerCase()).toEqual(
                    expect.stringContaining(teilModellVorhanden),
                ),
            );
    });

    test('Flugzeug zu nicht vorhandenem Modell', async () => {
        // given
        const body: GraphQLRequest = {
            query: `
                {
                    flugzeuge(suchkriterien: {
                        modell: "${teilModellNichtVorhanden}"
                    }) {
                        modell {
                            modell
                        }
                    }
                }
            `,
        };

        // when
        const { status, headers, data }: AxiosResponse<GraphQLResponseBody> =
            await client.post(graphqlPath, body);

        // then
        expect(status).toBe(HttpStatus.OK);
        expect(headers['content-type']).toMatch(/json/iu);
        expect(data.data!.flugzeuge).toBeNull();

        const { errors } = data;

        expect(errors).toHaveLength(1);

        const [error] = errors!;
        const { message, path, extensions } = error;

        expect(message).toMatch(/^Keine Flugzeuge gefunden:/u);
        expect(path).toBeDefined();
        expect(path![0]).toBe('flugzeuge');
        expect(extensions).toBeDefined();
        expect(extensions!.code).toBe('BAD_USER_INPUT');
    });

    test('Buecher mit einsatzbereit=true', async () => {
        // given
        const body: GraphQLRequest = {
            query: `
                {
                    flugzeuge(suchkriterien: {
                        einsatzbereit: true
                    }) {
                        einsatzbereit
                        modell {
                            modell
                        }
                    }
                }
            `,
        };

        // when
        const { status, headers, data }: AxiosResponse<GraphQLResponseBody> =
            await client.post(graphqlPath, body);

        // then
        expect(status).toBe(HttpStatus.OK);
        expect(headers['content-type']).toMatch(/json/iu);
        expect(data.errors).toBeUndefined();

        expect(data.data).toBeDefined();

        const { flugzeuge } = data.data!;

        expect(flugzeuge).not.toHaveLength(0);

        const flugzeugeArray: FlugzeugDTO[] = flugzeuge;

        flugzeugeArray.forEach((flugzeug) => {
            const { einsatzbereit, modell } = flugzeug;

            expect(einsatzbereit).toBe(true);
            expect(modell?.modell).toBeDefined();
        });
    });
});

/* eslint-enable @typescript-eslint/no-unsafe-assignment */
/* eslint-enable max-lines */

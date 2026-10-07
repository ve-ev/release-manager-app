import {describe, expect, it} from 'vitest';
import {API} from '../api';
import type {HostAPI} from '../../../../@types/globals';

describe('API.updateReleaseVersion revisions', () => {
  it('sends the revision of its own last save when the caller still holds the old copy', async () => {
    let stored = 3;
    const sent: Array<number | undefined> = [];
    const host = {
      fetchApp: async (_path: string, options: { body: { revision?: number } }) => {
        sent.push(options.body.revision);
        stored += 1;
        return {...options.body, revision: stored};
      }
    } as unknown as HostAPI;
    const api = new API(host);
    const copy = {id: 'r1', version: '1.0', releaseDate: '2026-01-01', revision: 3};

    await api.updateReleaseVersion(copy);
    await api.updateReleaseVersion(copy);
    await api.updateReleaseVersion({...copy, revision: undefined});

    expect(sent).toEqual([3, 4, undefined]);
  });
});

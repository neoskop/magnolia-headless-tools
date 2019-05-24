import { MagnoliaSourceOptions } from './interfaces/magnolia-source-options.interface';
import { fetchDamAssets } from './util/dam.util';
import {
  fetchPages,
  fetchSitemap,
  fetchWorkspace,
  sanitizeJson,
  writePagesFile,
  writeWorkspaceFile
} from './util/pages.util';

export function generate(options: MagnoliaSourceOptions): Promise<void> {
  return new Promise(async resolve => {
    const sitemap = await fetchSitemap(options);
    const website = await fetchPages(options);
    const pages = sitemap
      .map(
        path => website && website.find((page: any) => page['@path'] === path)
      )
      .filter(page => typeof page !== 'undefined');

    const workspaces: { [workspace: string]: any } = {};

    if (options.magnolia.workspaces) {
      for (const workspace of options.magnolia.workspaces) {
        workspaces[workspace] = await fetchWorkspace(workspace, options);
      }
    }

    // get dam jcr ids
    const nodes = pages.concat(
      Object.keys(workspaces).reduce(
        (prev, current) => prev.concat(workspaces[current]),
        []
      )
    );
    const match = JSON.stringify(nodes).match(
      /jcr:([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/g
    );

    let damUuids = match ? match.map(id => id.substring(4)) : [];
    damUuids = damUuids.filter((id, pos) => {
      return damUuids.indexOf(id) === pos;
    });

    const damAssets = await fetchDamAssets(damUuids, options);
    const pagesObj: any = pages.map((page: any) =>
      sanitizeJson(page, damAssets, pages, options, workspaces)
    );

    await writePagesFile(pagesObj, options);

    if (options.magnolia.workspaces) {
      for (const workspace of Object.keys(workspaces)) {
        const workspaceData = workspaces[workspace];

        if (workspaceData) {
          const sanitized: any[] = [];

          for (const item of workspaceData) {
            sanitized.push(
              sanitizeJson(item, damAssets, workspaceData, options, workspaces)
            );
          }

          await writeWorkspaceFile(workspace, sanitized, options);
        }
      }
    }

    resolve();
  });
}

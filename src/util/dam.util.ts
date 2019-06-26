import * as fs from 'fs-extra';
import * as pLimit from 'p-limit';
import * as request from 'request';
import * as retry from 'retry';
import { MagnoliaSourceOptions } from '../interfaces/magnolia-source-options.interface';
import { logger } from './logger';

export function fetchDamAssets(
  uuids: string[],
  options?: MagnoliaSourceOptions
): Promise<any> {
  return new Promise(resolve => {
    const operation = retry.operation();
    const damUrl = options.magnolia.url + options.magnolia.damJsonEndpoint;
    const limit = pLimit.default(
      options && options.magnolia.damConcurrency
        ? options.magnolia.damConcurrency
        : 10
    );

    request.get(
      damUrl,
      {
        json: true,
        headers: {
          Authorization: options.magnolia.auth.header,
          'User-Agent': 'Paperboy'
        },
        timeout: 60 * 1000
      },
      async (err, res, body) => {
        if (operation.retry(err)) {
          logger.error(
            'Attempt to get asset information failed, will retry in some time...'
          );
          return;
        }

        if (body && body.results && body.results.length > 0) {
          const sanitizedAssetJson = uuids
            .map(uuid =>
              body.results.find(
                (asset: any) =>
                  asset['jcr:uuid'] === uuid || asset['@id'] === uuid
              )
            )
            .map(json => (json ? sanitizeDamJson(json) : null));

          const assetsNeedingUpdate = sanitizedAssetJson.filter(asset => {
            if (asset) {
              const filePath = options.output.assets + asset.path;
              const fileExists = fs.existsSync(filePath);

              if (fileExists) {
                return (
                  new Date(fs.statSync(filePath).mtime).getTime() <
                  new Date(asset.lastModified).getTime()
                );
              }
            }

            return true;
          });

          await Promise.all(
            assetsNeedingUpdate.map(asset =>
              limit(
                (): Promise<void> => {
                  return downloadAsset(options, asset);
                }
              )
            )
          ).catch(error => {
            logger.error(error);
          });

          resolve(sanitizedAssetJson);
        } else {
          resolve([]);
        }
      }
    );
  });
}

function sanitizeDamJson(damJson: any): any {
  const sanitized: any = {};

  Object.keys(damJson).forEach(async key => {
    const sanitizedKey = key
      .replace(/^@path/, 'path')
      .replace(/^@/, '')
      .replace(/^mgnl:/, '')
      .replace(/^jcr:uuid/, 'id')
      .replace(/^jcr:mimeType/, 'mimeType');

    if (!sanitizedKey.match(/^jcr:/)) {
      sanitized[sanitizedKey] = damJson[key];
    }
  });

  return sanitized;
}

function downloadAsset(
  options: MagnoliaSourceOptions,
  asset: any
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (asset) {
      const filePath = options.output.assets + asset.path;
      const directory = filePath
        .split('/')
        .slice(0, -1)
        .join('/');

      fs.mkdirpSync(directory);

      request
        .get(options.magnolia.url + '/dam/jcr:' + asset.id, {
          headers: {
            Authorization: options.magnolia.auth.header,
            'User-Agent': 'Paperboy'
          },
          timeout: 60 * 1000
        })
        .on('response', res => {
          res.pipe(fs.createWriteStream(filePath));

          res.on('end', () => {
            resolve();
          });
        })
        .on('error', error => {
          reject(new Error(`Could not fetch asset ${asset.id}: ${error}`));
        });
    } else {
      resolve();
    }
  });
}

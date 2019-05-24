export interface MagnoliaSourceOptions {
  magnolia: {
    url: string;
    damJsonEndpoint: string;
    pagesEndpoint: string;
    sitemapEndpoint: string;
    workspaces?: string[];
    auth: {
      header: string;
    };
  };
  queue: {
    uri: string;
    exchangeName?: string;
  };
  name?: string;
  sourceFactory?: any;
  output: {
    assets: string;
    excludedProperties?: string[];
    json: string;
  };
}

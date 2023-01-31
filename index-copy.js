import html from './lib/html.js';
import contentTypes from './lib/content-types.js';
import Scraper from './lib/scraper.js';
import {generateJSONResponse, generateErrorJSONResponse} from './lib/json-response.js';

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const searchParams = new URL(request.url).searchParams;

  let url = searchParams.get('url');
  if (url && !url.match(/^[a-zA-Z]+:\/\//)) url = 'http://' + url;

  const selector = searchParams.get('selector');
  const spaced = searchParams.get('spaced'); // Adds spaces between tags
  const pretty = searchParams.get('pretty');

  if (!url || !selector) {
    return handleSiteRequest(request);
  }

  return handleAPIRequest({url, selector, spaced, pretty});
}

async function handleSiteRequest(request) {
  const url = new URL(request.url);

  if (url.pathname === '/' || url.pathname === '') {
    return new Response(html, {
      headers: {'content-type': contentTypes.html},
    });
  }

  return new Response('Not found', {status: 404});
}

async function handleAPIRequest({url, selector, attr, spaced, pretty}) {
  let scraper, result;
 
  try {
    scraper = await new Scraper().fetch(url);
  } catch (error) {
    return generateErrorJSONResponse(error, pretty);
  }

  // adding a way to catch redirects
  if ([301, 302].includes(scraper.response.status)) {
    return generateJSONResponse({status: scraper.response.status, location: scraper.response.headers.get('Location')}, pretty);
  }

  try {
 
      result = await scraper.querySelectors(selector).getAttribute(attr);
    
  } catch (error) {
    return generateErrorJSONResponse(error, pretty);
  }

  return generateJSONResponse({result}, pretty);
}

import Scraper from './scraper.js';
import {generateJSONResponse, generateErrorJSONResponse} from './json-response.js';

async function returnArray(selectors) {
  if (selectors.includes(',')) {
    return selectors.split(',').map(s => s.trim());
  } else {
    return [selectors];
  }
}

async function getContentType(str) {
   let inside = str.substring(
    str.indexOf("{") + 1, 
    str.lastIndexOf("}")
    );
    if (inside.includes('attr=')) {
      return 'attr';
    }
    return 'text';
}


async function getAttr(str) {
   let inside = str.substring(
    str.indexOf("{") + 1, 
    str.lastIndexOf("}")
    );
    if (inside.includes('attr=')) {
      return inside.split('=')[1];
    }
    else {
        throw new Error('attribute specified improperly');
    }
}
async function parseOneSelector(selector) {
    let element;
    let type;
    let retVal = {};

    if (selector.includes('{') && selector.includes('}')) {
        element = selector.split('{')[0];
        type = await getContentType(selector);
    } else {
        element = selector;
        type = 'text';
    }

    if (type === 'attr') {
        let attr = await getAttr(selector);
        retVal = {
            element: element,
            type: type,
            attr: attr
        }
    }
    else {
        retVal = {
            element: element,
            type: type
        }
    }

    return retVal;
        
    
}
//div p{attr=id}
//div p{text}
async function parseSelectors(selectorsToParse) {
  try {
    let selectorArray = await returnArray(selectorsToParse);
    return await Promise.all(selectorArray.map((sel) => parseOneSelector(sel)));
  } catch (error) {
    return generateErrorJSONResponse(`${error} on parseSelectors`);
  }
}

async function handleAPIRequest({url, selectors}) {
  try {
    let scraper;

    let parsedSelectors = await parseSelectors(selectors);

    scraper = await new Scraper().fetch(url);

    let result = await Promise.all(
      parsedSelectors.map(async selector => {
        if (selector.type === 'attr') {
          return await scraper.querySelector(selector.selector).getAttribute(selector.attr);
        } else {
          return await scraper.querySelector(selector.selector).getText({spaced: true});
        }
      }),
    );
    return generateJSONResponse({result});
  } catch (error) {
    return generateErrorJSONResponse(`${error} on handleapirequest`);
  }
}

export default handleAPIRequest;

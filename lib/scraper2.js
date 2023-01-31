const cleanText = s => s.trim().replace(/\s\s+/g, ' ');

class Scraper {
  constructor() {
    this.rewriter = new HTMLRewriter();
    return this;
  }

  async fetch(url, fetchOptions={}) {
    this.url = url;
    this.response = await fetch(url, {redirect: 'manual'});

    const server = this.response.headers.get('server');
    console.log(`Status Code? ${this.response.status}`);
    console.log(`Response: ${JSON.stringify(this.response.headers.get('Location'), null, 2)}`);

    const isThisWorkerErrorNotErrorWithinScrapedSite = [530, 503, 502, 403, 400].includes(this.response.status) && (server === 'cloudflare' || !server); /* Workers preview editor */

    if (isThisWorkerErrorNotErrorWithinScrapedSite) {
      throw new Error(`Status ${this.response.status} requesting ${url}`);
    }

    return this;
  }
  parseInputArguments(selectors) {
    //
    // example: "div, div text, a {attr:href}"
    //
    this.selectors = selectors.split(',').map(function (s) {
      let retObj = {};
      console.log(`Selector: ${s}`);
      let valueType = 'text';
      let selector = s.trim();

      if (s.split(' ').length > 1) {
        selector = s.split(' ')[0].trim();
        valueType = s.split(' ')[1].trim();
        if (valueType.indexOf('attr:') > -1 || valueType.indexOf('text') > -1) {
          valueType = valueType;
        } else {
          throw new Error(`Invalid value type: ${valueType}`);
        }
      }

      return {selector, valueType};
    });

  }
  async runTheRewriter() {
    this.results = [];
    this.selectors.forEach(selector => {


      this.rewriter.on(selector, {
        element(element) {
          this.results.push("fggg")
        },

        text(text) {
         this.results.push(text)
        },
      });
    });

    const transformed = this.rewriter.transform(this.response);

    await transformed.arrayBuffer();


  }

  async getText({spaced}) {
    const matches = {};
    const selectors = new Set(this.selector.split(',').map(s => s.trim()));

    selectors.forEach(selector => {
      matches[selector] = [];

      let nextText = '';

      this.rewriter.on(selector, {
        element(element) {
          matches[selector].push(true);
          nextText = '';
        },

        text(text) {
          nextText += text.text;

          if (text.lastInTextNode) {
            if (spaced) nextText += ' ';
            matches[selector].push(nextText);
            nextText = '';
          }
        },
      });
    });

    const transformed = this.rewriter.transform(this.response);

    await transformed.arrayBuffer();

    selectors.forEach(selector => {
      console.log(`Selector: ${selector}`);
      const nodeCompleteTexts = [];

      let nextText = '';

      matches[selector].forEach(text => {
        if (text === true) {
          if (nextText.trim() !== '') {
            nodeCompleteTexts.push(cleanText(nextText));
            nextText = '';
          }
        } else {
          nextText += text;
        }
      });

      const lastText = cleanText(nextText);
      if (lastText !== '') nodeCompleteTexts.push(lastText);
      matches[selector] = nodeCompleteTexts;
    });

    return selectors.length === 1 ? matches[selectors[0]] : matches;
  }

  async getAttribute(attribute) {
    class AttributeScraper {
      constructor(attr) {
        this.attr = attr;
        this.values = [];
      }

      element(element) {
        if (this.values.length > 5) return;

        this.values.push(element.getAttribute(this.attr));
      }
    }

    const scraper = new AttributeScraper(attribute);

    await new HTMLRewriter().on(this.selector, scraper).transform(this.response).arrayBuffer();

    return JSON.stringify(scraper.values) || '';
  }
}

export default Scraper;

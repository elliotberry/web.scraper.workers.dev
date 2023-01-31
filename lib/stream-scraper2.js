const cleanText = s => s.trim().replace(/\s\s+/g, ' ');

class AttributeScraper {
  constructor(attr) {
    this.attr = attr;
  }

  element(element) {
    if (this.value) return;

    this.value = element.getAttribute(this.attr);
  }
}

class Scraper {
  constructor() {
    this.rewriter = new HTMLRewriter();
    return this;
  }

  async fetch(url) {
    this.url = url;
    this.response = await fetch(url, {
      headers: {
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36',
      },
    });

    const server = this.response.headers.get('server');

    const isThisWorkerErrorNotErrorWithinScrapedSite = [530, 503, 502, 403, 400].includes(this.response.status) && (server === 'cloudflare' || !server); /* Workers preview editor */

    if (isThisWorkerErrorNotErrorWithinScrapedSite) {
      throw new Error(`Status ${this.response.status} requesting ${url}`);
    }

    return this;
  }

  querySelector(selector) {
    this.selector = selector;
    return this;
  }

  async getText() {
    try {
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
              nextText += ' ';
              matches[selector].push(nextText);
              nextText = '';
            }
          },
        });
      });

      const transformed = this.rewriter.transform(this.response);

      await transformed.arrayBuffer();

      selectors.forEach(selector => {
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
    } catch (error) {
      return [];
    }
  }

  async getAttribute(attribute) {
    try {
      const scraper = new AttributeScraper(attribute);

      await new HTMLRewriter().on(this.selector, scraper).transform(this.response).arrayBuffer();

      return scraper.value || '';
    } catch (error) {
      throw new Error(`Error getting attribute ${attribute} from ${this.selector} on ${this.url}`);
    }
  }
}

export default Scraper;

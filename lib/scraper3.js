const cleanText = s => s.trim().replace(/\s\s+/g, ' ');

class Scraper {
  constructor(selectors) {
    this.rewriter = new HTMLRewriter();
    this.selectors = selectors;
    return this;
  }

  async fetch(url) {
    this.url = url;
    this.response = await fetch(url, {redirect: 'manual'});
    // await fetch(url, { redirect: "manual" }).then((response) => {
    //   this.response = response
    //   console.log(`JSON ${JSON.stringify(response.headers.get("Location"),null,2)}`)
    // })

    const server = this.response.headers.get('server');
    console.log(`Status Code? ${this.response.status}`);
    console.log(`Response: ${JSON.stringify(this.response.headers.get('Location'), null, 2)}`);

    const isThisWorkerErrorNotErrorWithinScrapedSite = [530, 503, 502, 403, 400].includes(this.response.status) && (server === 'cloudflare' || !server); /* Workers preview editor */

    if (isThisWorkerErrorNotErrorWithinScrapedSite) {
      throw new Error(`Status ${this.response.status} requesting ${url}`);
    }

    return this;
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
    class GeneralScraper {
      constructor(type, attrVal = null) {
        console.log(type, attrVal, this)
        this.type = type;
        this.values = [];
        this.attrVal = attrVal;
      }

      element(element) {
        if (type === 'attr') {
          if (element.hasAttribute(attrVal)) {
            this.values.push(element.getAttribute(this.attrVal));
          }
        }
      }
      text(text) {
        if (this.type === 'text') {
          this.values.push(text.text);
        }
      }
    }

    const scraper = new GeneralScraper();
    let rewriter = new HTMLRewriter();

    let sels = [
        {tag: "div", type: "Text"}
    ];
    sels.forEach(function (s) {
      rewriter.on(s.tag, scraper(s));
    });

    await rewriter.transform(this.response).arrayBuffer();

    return JSON.stringify(scraper.values) || '';
  }
}

export default Scraper;

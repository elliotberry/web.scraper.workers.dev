export default {
    async fetch(request, env) {
      return await handleRequest(request)
    }
  }
  
  
  // Function to parse the HTML content and extract the data
  async function transform(html, config) {
    const rewriter = new HTMLRewriter()
      .on('*', (element, data) => {
        // Iterate through the config object
        Object.keys(config).forEach(fieldName => {
          const selector = config[fieldName].selector;
          const property = config[fieldName].property;
          // If the element has the selector, parse it
          if (element.matches(selector)) {
            element.setInnerContent('');
            const content = element[property];
            data.context.content[fieldName] = content;
          }
        });
      });
  
    // Stream the HTML content
    const transformed = await rewriter.transform(html);
  
    return {
      content: transformed.context.content
    };
  }
  
  async function handleRequest(request) {
    const config = {
     "url": "https://example.com/",
     "fields": [
       {
         "selector": "h1",
                "extract": "innerHTML"
       },
       {
         "selector": "a",
         "extract": "href"
       },
       {
         "selector": "p",
         "extract": "innerText"
       }
     ]
   }
  
    const init = {
      headers: { 'content-type': 'application/json' },
    }
    const response = await fetch(config.url, init)
    const html = await response.text()
  
    
  const rewriter = new HTMLRewriter()
      .on('*', (element, data) => {
        // Iterate through the config object
        Object.keys(config).forEach(fieldName => {
          const selector = config[fieldName].selector;
          const property = config[fieldName].property;
          // If the element has the selector, parse it
          if (element.matches(selector)) {
            element.setInnerContent('');
            const content = element[property];
            data.context.content[fieldName] = content;
          }
        });
      });
    return rewriter.transform(new Response(html, init))
  }
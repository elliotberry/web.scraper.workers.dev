export default {
    async fetch(request, env) {
      return await handleRequest(request)
    }
  }
  
  
  async function consume(stream) {
    const reader = stream.getReader();
    while (!(await reader.read()).done) { /* NOOP */ }
  }
  
  
  
  
  async function handleRequest(req) {
    const res = await fetch("https://www.cnn.com/");
   
    const ids = []
    let buffer = '';
  const rewriter = new HTMLRewriter()
    .on("*", {
      element(el) {
  
        let obj = {
          type: "element",
          tag: el.tagName,
          attributes: Array.from(el.attributes)
        }
        ids.push(obj)
        
      },
      text(text) {
   buffer = buffer + text.text;
  
          if (text.lastInTextNode) {
            let obj = {
          type: "text",
          "content": buffer.trim()
        }
        ids.push(obj)
            buffer = '';
          } else {
            text.remove();
          }
       
        
      }
  
    })
  
  await consume(rewriter.transform(res).body)
  
    return new Response(JSON.stringify(ids));
  }
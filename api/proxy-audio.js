module.exports = (req, res) => {
  res.setHeader('Content-Type','text/plain');
  res.setHeader('Access-Control-Allow-Origin','*');
  res.statusCode = 200;
  res.end('proxy-audio: OK');
};

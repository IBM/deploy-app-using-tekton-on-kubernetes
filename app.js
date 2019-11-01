const app = require('express')()

app.get('/', (req, res) => {
  res.send("Hello from Appsody!");
});

var port = 3300;

var server = app.listen(port, function () {
  console.log("Server listening on " + port);
})

module.exports.app = app;

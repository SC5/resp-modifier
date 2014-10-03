var express = require("express");
var app = express();
var iconv = require("iconv-lite");
var fs = require("fs");
var matcher = iconv.decode(fs.readFileSync(__dirname + "/fixtures/iso-8859-1.matcher.html"), "iso-8859-1");

app.use(express.bodyParser());
app.use(express.methodOverride());

// load liveReload script only in development mode
app.configure("development", function () {
    // live reload script
    var livereload = require("../index.js");
    app.use(livereload({
        rules: [
            {
                match: /html5/,
                fn: function () {
                    return "matcher";
                }
            }
        ],
        ignore: [".woff", ".flv"]
    }));
});

// load static content before routing takes place
app.use(express["static"](__dirname + "/fixtures"));

// load the routes
app.use(app.router);

app.get("/iso-8859-1", function (req, res) {
    res.set({"content-type": "text/html; charset=ISO-8859-1"});
    res.sendfile(__dirname + "/fixtures/iso-8859-1.html");
});


// start the server
if (!module.parent) {
    var port = settings.webserver.port || 3000;
    app.listen(port);
    console.log("Express app started on port " + port);
}

// run the tests
var request = require("supertest");
var assert = require("assert");

describe("GET /iso-8859-1", function () {
    it("respond with inserted script with correct charset", function (done) {
        var req = request(app)
            .get("/iso-8859-1")
            .set("Accept", "text/html")
            .end(function (err, res) {
                // res.text is decoded as utf8 automatically so we need
                // to decode matcher also as utf8
                assert.equal(res.text, iconv.decode(new Buffer(matcher, "binary"), "utf8"));
                done();
            });
    });
});
var iconv = require("iconv-lite");

module.exports = function (opt) {
    // options
    opt = opt || {};
    var defaultIgnoreTypes = [
            // text files
            "js", "json", "css",
            // image files
            "png", "jpg", "jpeg", "gif", "ico", "tif", "tiff", "bmp", "webp", "psd",
            // vector & font
            "svg", "woff", "ttf", "otf", "eot", "eps", "ps", "ai",
            // audio
            "mp3", "wav", "aac", "m4a", "m3u", "mid", "wma",
            // video & other media
            "mpg", "mpeg", "mp4", "m4v", "webm", "swf", "flv", "avi", "mov", "wmv",
            // document files
            "pdf", "doc", "docx", "xls", "xlsx", "pps", "ppt", "pptx", "odt", "ods", "odp", "pages", "key", "rtf", "txt", "csv",
            // data files
            "zip", "rar", "tar", "gz", "xml", "app", "exe", "jar", "dmg", "pkg", "iso"
        ].map(function(ext) { return "." + ext; });
    var ignore = opt.ignore || opt.excludeList || defaultIgnoreTypes;
    var html = opt.html || _html;
    var rules = opt.rules || [];

    // helper functions
    var regex = (function() {
        var matches = rules.map(function(item) {
            return item.match.source;
        }).join("|");
        return new RegExp(matches);
    })();

    function _html(str) {
        if (!str) {
            return false;
        }
        // Test to see if start of file contents matches:
        // - Optional byte-order mark (BOM)
        // - Zero or more spaces
        // - Any sort of HTML tag, comment, or doctype tag (basically, <...>)
        return /^(\uFEFF|\uFFFE)?\s*<[^>]+>/i.test(str);
    }

    function exists(body) {
        if (!body) {
            return false;
        }
        return regex.test(body);
    }

    function snip(body) {
        if (!body) {
            return false;
        }
    }

    function snap(body) {

        var _body = body;
        rules.forEach(function(rule) {
            if (rule.match.test(body)) {
                _body = _body.replace(rule.match, function(w) {
                    return rule.fn(w);
                });
                return true;
            }
            return false;
        });
        return _body;
    }

    function accept(req) {
        var ha = req.headers["accept"];
        if (!ha) {
            return false;
        }

        return (~ha.indexOf("html"));
    }

    function leave(req) {
        var url = req.url;
        var ignored = false;
        if (!url) {
            return true;
        }
        ignore.forEach(function(item) {
            if (~url.indexOf(item)) {
                ignored = true;
            }
        });
        return ignored;
    }

    // middleware
    return function (req, res, next) {
        if (res._livereload) {
            return next();
        }
        res._livereload = true;

        var writeHead = res.writeHead;
        var write = res.write;
        var end = res.end;

        if (!accept(req) || leave(req)) {
            return next();
        }

        req.headers["accept-encoding"] = "identity";

        function restore() {
            res.writeHead = writeHead;
            res.write = write;
            res.end = end;
        }

        function getCharset() {
            var resCharset = res._headers["content-type"] ? res._headers["content-type"].match(/charset=(.*)/) : false;
            if (resCharset) {
                return resCharset[1].toLowerCase();
            }
            return false;
        }

        res.push = function(chunk) {
            res.data = (res.data || "") + chunk;
        };

        res.inject = res.write = function(string, encoding) {
            if (!!string) {
                var charset = getCharset();
                var body;
                if (charset) {
                    body = string instanceof Buffer ? iconv.decode(string, charset) : string;
                } else {
                    body = string instanceof Buffer ? string.toString(encoding) : string;
                }
                if (html(body) || html(res.data)) {
                    if (exists(body) && !snip(res.data)) {
                        var newString = snap(body);
                        res.push(newString);
                    } else {
                        res.push(body);
                    }
                    return true;
                } else {
                    restore();
                    return write.call(res, string, encoding);
                }
            }
            return true;
        };

        res.writeHead = function() {
            var headers = arguments[arguments.length - 1];
            if (headers && typeof headers === "object") {
                for (var name in headers) {
                    if (/content-length/i.test(name)) {
                        delete headers[name];
                    }
                }
            }

            var header = res.getHeader( "content-length" );
            if ( header ) {
                res.removeHeader( "content-length" );
            }

            writeHead.apply(res, arguments);
        };

        res.end = function(string, encoding) {

            restore();

            var result = res.inject(string, encoding);

            if (!result) {
                return end.call(res, string, encoding);
            }

            if (res.data !== undefined && !res._header) {
                res.setHeader("content-length", Buffer.byteLength(res.data, encoding));
            }

            var charset = getCharset();
            if (charset) {
                res.end(iconv.encode(res.data, charset), encoding);
            } else {
                res.end(res.data, encoding);
            }
        };
        next();
    };
};
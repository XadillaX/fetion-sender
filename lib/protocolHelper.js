/**
 * Created with JetBrains WebStorm.
 * User: XadillaX
 * Date: 13-10-13
 * Time: 下午11:45
 * Fetion sender protocol helper.
 */
var spider = require("nodegrassex");
var dummyUserAgent = "Mozilla/5.0 (Linux; U; Android 4.1.1; zh-cn; M040 Build/JRO03H) AppleWebKit/534.30 (KHTML, like Gecko) Version/4.0 Mobile Safari/534.30";
var baseHeader = {
    "Host"          : "f.10086.cn",
    "User-Agent"    : dummyUserAgent,
    "Connection"    : "close",
    "Content-Type"  : "application/x-www-form-urlencoded"
};
var baseUrl = "http://f.10086.cn/";
var functions = require("./utilFunction");

function protocol() {
    this.cookies = "";
    this.mainPage = "";

    this.phonenumber = "";
    this.password = "";
}

exports.create = function() {
    return new protocol();
};

/**
 * verify if one is logged in.
 * @returns {boolean}
 */
protocol.prototype.isLoggedIn = function() {
    return this.cookies !== "";
};

/**
 * add a fetion friend.
 * @param phonenumber
 * @param callback
 */
protocol.prototype.addFriend = function(phonenumber, callback) {
    // TODO...
};

/**
 * login to fetion.
 * @param phonenumber
 * @param password
 * @param callback
 */
protocol.prototype.login = function(phonenumber, password, callback) {
    /**
     * go to post the data to url:
     *   [ http://f.10086.cn/huc/user/space/login.do?m=submit&fr=space ]
     */
    var self = this;
    var loginUrl = baseUrl + "/huc/user/space/login.do?m=submit&fr=space";
    var loginHeader = functions.cloneObject(baseHeader);
    var loginData = {
        "mobilenum"     : phonenumber,
        "password"      : password
    };
    loginHeader["Content-Length"] = functions.getDataLength(loginData);
    callback = callback.bind(this);
    spider.post(loginUrl, function(data, status, respheader) {
        /**
         * it will redirect you to
         *
         *   [ http://f.10086.cn/huc/user/space/ ]
         *
         * if you logged in successfully.
         */
        if(status === 302 && respheader["location"] === "http://f.10086.cn/huc/user/space/") {
            var cookieArr = respheader["set-cookie"];
            //console.log(respheader);
            for(var i = 0; i < cookieArr.length; i++) {
                if(cookieArr[i].indexOf('cell_cookie="";') !== -1) continue;
                self.cookies += functions.getCookieString(cookieArr[i]);
            }

            /**
             * when get cookie, you should do the real loggin in.
             */
            var chkLoginUrl = baseUrl + "im/login/cklogin.action";
            var chkLoginHeader = functions.cloneObject(baseHeader);
            chkLoginHeader["Content-Length"] = 0;
            chkLoginHeader["Cookie"] = self.cookies;
            spider.post(chkLoginUrl, function(data, status, respheader) {
                if(status === 302 && respheader["location"] === "http://f.10086.cn/im/index/index.action") {
                    self.phonenumber = phonenumber;
                    self.password = password;

                    callback(true, "");
                    return;
                } else {
                    //self.cookies = "";
                    callback(true, "Unknown error while checking login status.");
                    return;
                }
            }, chkLoginHeader, {}, "utf8").on("error", function(e) {
                self.cookies = "";
                callback(false, "Spider error: " + e.message);
                return;
            });

            return;
        } else {
            if(data.indexOf("密码错误.") !== -1) {
                callback(false, "Wrong password.");
                return;
            } else if(data.indexOf("验证码不能为空！") !== -1) {
                callback(false, "You failed to logged in for several times so you have to log in correctly on PC or mobile.");
                return;
            } else if(data.indexOf("账号或密码错误！") !== -1) {
                callback(false, "Wrong username or password.");
                return;
            } else {
                callback(false, "Other error.");
                return;
            }
        }
    }, loginHeader, loginData, "utf8").on("error", function(e) {
        callback(false, "Spider error: " + e.message);
        return;
    });
};

/**
 * send a message to friend or self.
 * @param phonenumber
 * @param msg
 * @param callback
 */
protocol.prototype.send = function(phonenumber, msg, callback) {
    var self = this;
    callback = callback.bind(this);
    if(!this.isLoggedIn()) {
        callback(false, "You have to log in first.");
        return;
    }

    if(phonenumber !== this.phonenumber) {
        this.getUserId(phonenumber, function(status, userid) {
            if(!status) {
                callback(false, userid);
                return;
            }

            this.sendToFriend(userid, msg, callback);
            return;
        });
    } else {
        this.sendToSelf(msg, callback);
        return;
    }
};

/**
 * send a message to self.
 * @param msg
 * @param callback
 */
protocol.prototype.sendToSelf = function(msg, callback) {
    var self = this;
    callback = callback.bind(this);
    if(!this.isLoggedIn()) {
        callback(false, "You have to log in first.");
        return;
    }

    var sendUrl = baseUrl + "im/user/sendMsgToMyselfs.action";
    var sendData = {
        "msg"       : msg
    };
    var sendHeader = functions.cloneObject(baseHeader);
    sendHeader["Content-Length"] = functions.getDataLength(sendData);
    sendHeader["Cookie"] = this.cookies;

    spider.post(sendUrl, function(data, status, respheader) {
        if(data.indexOf("短信发送成功!") !== -1) {
            callback(true, "");
            return;
        } else if(data.indexOf("短信内容不能为空") !== -1) {
            callback(false, "Empty message.");
            return;
        } else {
            callback(false, "Unknown error.");
            return;
        }
    }, sendHeader, sendData, "utf8").on("error", function(e) {
        callback(false, "Spider error: " + e.message);
        return;
    });
};

/**
 * send a message to a friend.
 * @param userid
 * @param msg
 * @param callback
 */
protocol.prototype.sendToFriend = function(userid, msg, callback) {
    var self = this;
    callback = callback.bind(this);
    if(!this.isLoggedIn()) {
        callback(false, "You have to log in first.");
        return;
    }

    /**
     * get the csrf token first.
     */
    this.getCsrfToken(userid, function(status, csrf) {
        if(!status) {
            callback(false, csrf);
            return;
        }

        var sendUrl = baseUrl + "im/chat/sendShortMsg.action?touserid=" + userid;
        var sendData = {
            "msg"       : msg,
            "csrfToken" : csrf
        };
        var sendHeader = functions.cloneObject(baseHeader);
        sendHeader["Cookie"] = self.cookies;
        sendHeader["Content-Length"] = functions.getDataLength(sendData);
        spider.post(sendUrl, function(data, status, respheader) {
            if(data.indexOf("发送消息成功!") !== -1) {
                callback(true, "");
                return;
            } else if(data.indexOf("消息不能为空") !== -1) {
                callback(false, "Empty message.");
                return;
            } else {
                callback(false, "Unknown error.");
                return;
            }
        }, sendHeader, sendData, "utf8").on("error", function(e) {
            callback(false, "Spider error: " + e.message);
            return;
        });
    });
};

/**
 * get the csrf token: you must get it before you send a message to your friend.
 * @param userid
 * @param callback
 */
protocol.prototype.getCsrfToken = function(userid, callback) {
    var self = this;
    callback = callback.bind(this);
    if(!this.isLoggedIn()) {
        callback(false, "You have to log in first.");
        return;
    }

    var csrfUrl = baseUrl + "im/chat/toinputMsg.action?touserid=" + userid;
    var csrfHeader = functions.cloneObject(baseHeader);
    csrfHeader["Content-Length"] = 0;
    csrfHeader["Cookie"] = this.cookies;
    spider.post(csrfUrl, function(data, status, respheader) {
        var searchText = 'name="csrfToken" value="';
        var pos = data.indexOf(searchText);
        if(pos === -1) {
            callback(false, "Can't fetch the CSRF token for " + userid + ".");
            return;
        }
        pos += searchText.length;
        var pos2 = data.indexOf('"/>', pos);
        var csrf = data.substring(pos, pos2);

        callback(true, csrf);
        return;
    }, csrfHeader, {}, "utf8").on("error", function(e) {
        callback(false, "Spider error: " + e.message);
        return;
    });
};

/**
 * get user ID.
 * @param phonenumber
 * @param callback
 */
protocol.prototype.getUserId = function(phonenumber, callback) {
    var self = this;
    callback = callback.bind(this);
    if(!this.isLoggedIn()) {
        callback(false, "You have to log in first.");
        return;
    }

    var searchUrl = baseUrl + "/im/index/searchOtherInfoList.action";
    var searchHeader = functions.cloneObject(baseHeader);
    var searchData = {
        "searchText"        : phonenumber
    };
    searchHeader["Content-Length"] = functions.getDataLength(searchData);
    searchHeader["Cookie"] = this.cookies;
    spider.post(searchUrl, function(data, status, respheader) {
        var searchText = "/im/chat/toinputMsg.action?touserid=";
        var pos = data.indexOf(searchText);
        if(pos === -1) {
            callback(false, "Can't find friend " + phonenumber + ".");
            return;
        }
        pos += searchText.length;
        var pos2 = data.indexOf("&amp;", pos);
        var userid = data.substring(pos, pos2);

        callback(true, userid);
        return;
    }, searchHeader, searchData, "utf8").on("error", function(e) {
        callback(false, "Spider error: " + e.message);
        return;
    });
};

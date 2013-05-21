
var     SessionManager = require('./session_manager')
    ,   AutoAPI = require('./auto_api')
    ,   DBManager = require('./db_manager')
    ,   crypto = require('crypto')
    ,   he = require('./http_errors')
    ;

var API = function(config) {
    this.db = new DBManager(config);
    this.sessionManager = new SessionManager(config, this.db);
    this.autoAPI = new AutoAPI(this.sessionManager, this.db);
}

function signup(self, req, res, match, opts)
{
    self.db.query("INSERT INTO my.users (name) VALUES ("+self.e(req.body.name)+")", [], function(err, rows, fields){
        if (err) return he.db_error(res, err);
        res.send(rows);     // TMP todo -- is this wise?
        res.end();
        });
}

function get_current_user(self, req, res, match, opts)
{
    var uid = self.sessionManager.uid_from_req(req);
    if (uid<=0) /* no session */
        res.send('{}');
    else 
        self.db.query("SELECT id, email_address, email, name, last_name FROM users WHERE id = " + self.e(uid), [], function(err, rows, fields){
            if (err) return he.db_error(res, err);
            if (rows.length==1)
                res.send({user: {id: rows[0].id, email_address: rows[0].email_address, email: rows[0].email, name: rows[0].name, last_name: rows[0].last_name}});
            else {
                /* ephemeral use was deleted... */
                // return he.internal_server_error(res);
                res.send('{}');
                }
            res.end();
            });
}

/*
function _maybe_redirect(req, res, result)
{
    if (req.body._success_url) {
        res.redirect(req.body._success_url);
        }
    else {
        res.send(result);
        res.end();
        }
}
*/

function _login(self, req, res, match, opts)
{
    self.db.query("SELECT id, crypted_password, salt, email_address, email, name, last_name FROM users WHERE email_address="+self.e(req.body.login), [], function(err, rows, fields){
        if (err) return he.db_error(res, err);
        // Digest::SHA1.hexdigest("--#{salt}--#{password}--") -- from ruby/hobo
        var i;
        var result = {};
// what's with the list here? ... depreciate ... , oh I guess it could be used to allow multiple same emails for different accounts ...
        for(i=0; i<rows.length; i++) {
            row = rows[i];
            try {
                if ( crypto.createHash('sha1').update('--'+row.salt+'--'+req.body.password+'--').digest('hex') == row.crypted_password ) {
                    if (self.sessionManager.set_rails_uid(res, row.id))
                        result = {user: {id: row.id, email_address: row.email_address, email: row.email, name: row.name, last_name: row.last_name}};
                    else 
                        return he.internal_server_error(res);
                    break;
                    }
                }
            catch(e) { console.log(e); }
            }
if (!result.user) req.body._success_url=req.body._failure_url;    // hack ......... TODO tmp pending cleanup of error handing functions
        he.ok(req, res, result);
        });
}

function _login_by_token(self, req, res, match, opts)
{
    var sql = "SELECT t.user_id, u.email_address, u.email, u.name, u.last_name, t.id FROM users u, tokens t  WHERE u.id=? AND u.id=t.user_id AND t.link_key=? AND t.template='ephemeral_once' AND (t.expires>NOW() OR t.expires IS NULL) AND t.is_deleted IS NULL";
    var token_parts = req.body.token.split(',',2);
    self.db.query(sql, [token_parts[0], token_parts[1]], function(err, rows, fields){
        if (err) return he.db_error(res, err);
        if (rows.length!==1) return he.internal_server_error(res);
        var row = rows[0];
        result = {user: {id: row.user_id, email_address: row.email_address, email: row.email, name: row.name, last_name: row.last_name}};
// this is how we would fake it:
//        self.db.query("UPDATE tokens SET updated_at=NOW() WHERE id=?", [row.id], function(err, rows, fields){
        self.db.query("UPDATE tokens SET updated_at=NOW(), is_deleted=1 WHERE id=?", [row.id], function(err, rows, fields){
            if (err) return he.db_error(res, err);
            if (rows.affectedRows!==1) return he.internal_server_error(res);
            if (!self.sessionManager.set_rails_uid(res, row.user_id))
                return he.internal_server_error(res);
            //_maybe_redirect(req, res, result);
            he.ok(req, res, result);
            });
        });
}

function login(self, req, res, match, opts)
{
    if (req.body.login && req.body.password)
        return _login(self, req, res, match, opts);
    else if (req.body.token)
        return _login_by_token(self, req, res, match, opts);
    else 
        return he.bad(res);
}

function logout(self, req, res, match, opts)
{
    if (!self.sessionManager.delete_rails(res))
        return he.internal_server_error(res);
    else
        //return _maybe_redirect(req, res, '{}');
        return he.ok(req, res, {});
}

/* on hiatus
function country(self, req, res, match, opts)
{
    res.send({data: [
        { code: 1,      name: 'United States' },
        { code: 212,    name: 'Morocco' },
        { code: 33,     name: 'France' },
        { code: 34,     name: 'Spain' },
        { code: 351,    name: 'Portugal' },
        { code: 353,    name: 'Ireland' },
        { code: 39,     name: 'Italy' },
        { code: 44,     name: 'United Kingdom' },
        { code: 49,     name: 'Germany' },
        ]});
    res.end();
} */

var db_cols = [
    ['u.id', 'user_id'],
    ['u.email_address', 'email_address'],
    ['u.email', 'email'],
    ['u.name', 'first_name'],
    ['u.last_name', 'last_name'],
    ['c.id', 'conference_id'],
    ['c.name', 'conference_name'],
    ['c.config', 'conference_config'],
    ['c.introduction', 'conference_introduction'],
    ['c.uri', 'conference_uri'],
    ['c.access_config', 'conference_access_config'],
    ['c.skin_id', 'conference_skin_id'],
    ['i.id', 'invitation_id'],
    ['i.pin', 'pin'],
    ['i.role', 'role'],
    ['i.dialin', 'myAccessInfo'],
    ];
var db_cols_sql = null;
function invitation(self, req, res, match, opts)
{
//console.log('>> ' + new Date().getTime());
    var uid = self.sessionManager.uid_from_req(req);
    if (uid<0) /* no session, no problem */ 
        uid = 0;    /* set uid to 0 so we get NULL for the user */
        //return he.forbidden(res)
    if (!db_cols_sql) {
        var a = [];
        for(var i=0; i<db_cols.length; i++)
            a.push(db_cols[i][0] + ' AS ' + db_cols[i][1]);
        db_cols_sql = a.join(', ');
        }
/* --- always get 1 row with or without any of user, conference and invitation data, example:
   ---
select u.id as user, c.id as conference, i.id as invitation
FROM (SELECT 42 AS badass FROM dual) AS hack
    left outer join users u on u.id = 371
    left outer join (
    conferences c left outer join invitations i
        ON i.conference_id = c.id and i.user_id = 371 and i.is_deleted IS NULL
    ) on c.uri = 'friday' AND c.is_deleted IS NULL;

*/
/*
    var suid = self.e(uid), sql = "SELECT "+db_cols_sql+" \
FROM (SELECT 42 AS badass FROM dual) AS hack\
    LEFT OUTER JOIN users u ON u.id = "+suid+"\
    LEFT OUTER JOIN (\
    conferences c LEFT OUTER JOIN (\
        invitations i INNER JOIN users u2 ON i.user_id = u2.id AND u2.id = "+suid+"\
        ) ON i.conference_id = c.id\
    ) ON "; */
    var suid = self.e(uid), sql = "SELECT "+db_cols_sql+" \
FROM (SELECT 42 AS badass FROM dual) AS hack\
    LEFT OUTER JOIN users u ON u.id = "+suid+"\
    LEFT OUTER JOIN (\
    conferences c LEFT OUTER JOIN invitations i \
        ON i.conference_id = c.id AND i.user_id = "+suid+" AND i.is_deleted IS NULL \
    ) ON c.is_deleted IS NULL AND ";
    if (/^(?:i|byid)\/(\d+)$/.exec(match[1]))
        sql += 'c.id=' + RegExp.$1;
    else 
        sql += 'c.uri=' + self.e(match[1]);
    self.db.query(sql, [], function(err, rows, fields){
        if (err) return he.db_error(res, err, sql);
/*
console.log('LEN='+rows.length);
console.log(rows);
        if (rows.length<1)                        /* because we should always get exactly 1 row *./
So this was kicking out where we pointed at a new environment with old session, it confused and created multiple invites for same
user and conference -- question: how could it have created multiple invites??? 

*/
        if (rows.length!==1)                        /* because we should always get exactly 1 row */
            return he.internal_server_error(res);
/*
        if (rows.length==0) {   /* perhaps send 404 if conference does not exist vs. data: null if no invitation? *./
            res.send(JSON.stringify({data: null}));
            res.end();
            return;
            }
*/
        data = [];
        var len = fields.length, row = rows[0];
        for(var i=0; i<fields.length; i++)
            data.push([fields[i].name, row[fields[i].name]]);
        /* extra *special* stuff */
//        data.push(['media_server_uri', 'rtmp%3A%2F%2Fvideo.babelroom.com%3A1936%2FoflaDemo']);
        var a='', l=10, b = crypto.randomBytes(l);
        for(var i=0; i<l; i++)
            a += (b[i] & 0xff).toString(16);
//console.log(rows);
//console.log(fields);
        data.push(['connection_salt', a]);
        //res.send({data: data}); -- don't do this; express "helps" with ETag and other ****
        obj = {};
        for(var i=0; i<data.length; i++)
            obj[data[i][0]] = data[i][1];
        obj.user_name = obj.first_name?(obj.first_name+(obj.last_name?(' '+obj.last_name):'')):(obj.last_name||'')  /* happy that this is one of the best ways to do this */
        obj.is_host = (obj.role=='Host'); //-- now client reads this from stream -- still sent it as initial value, useful for say locking out non-hosts right off the bat
        delete obj.role;   /* not needed for client */
        obj.is_live = false;    /* set to true on client once it's caught up on stream history (when it sees it's only new connection id) */
// this may be too fast => we may have a provisioning conference before netops is done
        try {
            if (obj.conference_config) {
                obj.conference_estream_id = obj.conference_config.split(',')[0].split('=')[1];
                }
            }
        catch(err) {
            console.log(err);   // TODO tmp. what to do?
            }
        res.send(JSON.stringify({data: obj}));
        res.end();
        });
}

/* depreciate
function conference_access(self, req, res, match, opts)
{
    var sql = "SELECT c.name, c.introduction, c.access_config FROM conferences c WHERE ";
    if (/^(?:i|byid)\/(\d+)$/.exec(match[1]))
        sql += 'c.id=' + RegExp.$1;
    else 
        sql += 'c.uri=' + self.e(match[1]);
    self.db.query(sql, [], function(err, rows, fields){
        if (err) return he.db_error(res, err, sql);
        if (rows.length==0) return he.not_found(res);
        if (rows.length>1) return he.internal_server_error(res);
        var r = rows[0];
        res.send(JSON.stringify({data: {name: r['name'], introduction: r['introduction'], access_config: r['access_config']}}));
        res.end();
        });
}
*/

function _enter(self, creating_uid, req, res, match, opts)
{
    /* check conference existance and access */
    var sql = "SELECT c.id, c.access_config, c.owner_id FROM conferences c WHERE is_deleted IS NULL AND ";
//console.log(match[1]);
    if (/^(?:i|byid)\/(\d+)$/.exec(match[1]))
        sql += 'c.id=' + RegExp.$1;
    else 
        sql += 'c.uri=' + self.e(match[1]);
//console.log(sql);
    self.db.query(sql, [], function(err, rows, fields){
        if (err) return he.db_error(res, err);
        if (rows.length!==1 || !rows[0].id) return he.internal_server_error(res);
        var cid = rows[0].id;
        var owner_id = rows[0].owner_id;
        var resultset = {user: {}}
        function create_invitation(uid) {
            var role = ((req.body.invitation && req.body.invitation.role==='Host' && creating_uid && creating_uid===owner_id)?'Host':null);
            resultset.user.id = uid;
            /* insert invitation */
            self.db.query("INSERT INTO invitations (created_at,updated_at,conference_id,user_id,dialin,role) VALUES (NOW(),NOW(),?,?,'(415) 449 8899',?)", [cid,uid,role], function(err, rows, fields){
                if (err) return he.db_error(res, err);
                if (!rows.insertId) return he.internal_server_error(res);
                var iid = rows.insertId;
                self.db.query("UPDATE pins SET updated_at=NOW(), invitation_id=? WHERE invitation_id IS NULL LIMIT 1", [iid], function(err, rows, fields){
                    if (err) return he.db_error(res, err);
                    if (rows.affectedRows!==1) return he.internal_server_error(res);
// ---- extra query in case we need to get the pin ... do we?
//                    self.db.query("SELECT pin FROM pins WHERE invitation_id=?", [iid], function(err, rows, fields){
//                        if (err) return he.db_error(res, err);
//                        if (rows.length!==1) return he.internal_server_error(res);
//                        var pin = rows[0].pin;
//                        self.db.query("UPDATE invitations SET updated_at=NOW(), pin=? WHERE id=?", [pin,iid], function(err, rows, fields){
                        self.db.query("UPDATE invitations SET updated_at=NOW(), pin=(SELECT pin FROM pins WHERE invitation_id=?) WHERE id=?", [iid,iid], function(err, rows, fields){
                            if (err) return he.db_error(res, err);
                            if (rows.affectedRows!==1)
                                return he.internal_server_error(res);
                            /* set uid in cookie or make token */
                            if (opts && opts.no_cookie) {
                                function finish() {
//console.log(resultset);
                                    res.send(JSON.stringify(resultset));
                                    res.end();
                                    }
                                if (!req.body.return_token)
                                    return finish();
                                var token = crypto.randomBytes(30).toString('base64').replace(/[^A-Za-z0-9]/g,'J');
                                self.db.query("INSERT INTO tokens (template,link_key,created_at,updated_at,user_id) VALUES (?,?,NOW(),NOW(),?)", ['ephemeral_once',token,uid], function(err, rows, fields){
                                    if (err) return he.db_error(res, err);
                                    if (rows.affectedRows!==1)
                                        return he.internal_server_error(res);
                                    resultset['token'] = uid+','+token;
                                    finish();
                                    });
                                }
                            else {
                                if (!self.sessionManager.set_rails_uid(res, uid))
                                    return he.internal_server_error(res);
                                return he.ok(req, res, resultset);
                                }
                            });
//                        });
                    });
                });
            }
        function continue_with_user(uid) {
            if (!req.body.avatar_url)
                return create_invitation(uid);
            sql = 'INSERT INTO media_files (user_id,upload_url,bucket,created_at,updated_at) VALUES (?,?,"Avatar",NOW(),NOW())';
            self.db.query(sql, [uid,req.body.avatar_url], function(err, rows, fields){
                if (err) return he.db_error(res, err);
                if (!rows.insertId) return he.internal_server_error(res);
                create_invitation(uid);
                });
            }

        if (creating_uid && !(opts && opts.create_separate_user))
            return continue_with_user(creating_uid);
        /* else */
        /* conference needs to be public in order for non-owner & non-host to add self .... TODO tmp */
        /* insert user */
        /* check arguments */
        var u = req.body.user;
        if (!u)
            u = {};
        if (!u.name && req.body.name)   /* why allow either name or user.name? I know there was a good reason for this but I've forgotten ... */
            u.name = req.body.name;
        sql = "INSERT INTO users (`created_at`,`updated_at`";
        var vals = ") VALUES (NOW(),NOW()";
        for(var i in u)
            if (u.hasOwnProperty(i)) {
//console.log(i);
                if (i in {name:1,last_name:1,email:1,phone:1,origin_data:1,origin_id:1}) {
                    sql += ',`'+i+'`';
                    vals += ','+self.e(u[i]);
                    }
                else
                    return he.bad(res);
                }
/*
    return an error on no name
        if (!u.name)
            return he.bad(res);
*/
        if (!('name' in/* need to check this way b/c of "in" for loop above */u)) { /* make a new name */
            sql += ", `name`";
            vals += ", CONCAT('User #',LPAD(MOD(LAST_INSERT_ID()+1,1000), 3, '0'))";/* User #045 */
            resultset.user.name = '';
            }
        else
            resultset.user.name = u.name;
        sql += vals + ')';
        self.db.query(sql, [], function(err, rows, fields){
            if (err) return he.db_error(res, err);
            if (!rows.insertId) return he.internal_server_error(res);
            continue_with_user(rows.insertId /*uid of new user */);
            });
        });
}
function enter(self, req, res, match, opts)
{
    self.sessionManager.uid_from_req2(req,function(uid,code){
        _enter(self, uid>0?uid:0, req, res, match, opts);
        });
}

var aq_commands = [
    "0",
    "user/select/SELECT phone FROM users WHERE id = ?",
    "user/sql/UPDATE users SET phone = ? WHERE id = ?",
    "user/update",
    "media_file/select/SELECT * FROM media_files WHERE user_id = ? OR conference_id = ?",
    "invitation/select/SELECT i.pin, i.user_id, u.name, u.last_name, CONCAT(u.name,' ',u.last_name) AS full_name, i.role, u.phone, u.email_address FROM invitations i, users u WHERE i.user_id = u.id AND i.conference_id = ?",
    "user/select/SELECT id FROM users WHERE email_address=? LIMIT 1",
    "skin/select/SELECT id,name,immutable,preview_url FROM skins",            // 7
//                    "skin/sql/INSERT INTO skins (name) VALUES (?)",     // 8
    "skin/insert",     // 8
    "skin/copy",
    "skin/update",                                      // 10 
    "conference/update",                                // 11
//                    "skin/select/SELECT body FROM skins WHERE id = ? -- ignore name param = ?", -- leave as example of using comment for unwanted parameters
    "skin/delete",            // 12
    "skin/select/SELECT id,name,body FROM skins WHERE id=?",
    "media_file/select/SELECT * FROM media_files WHERE ((user_id=? OR conference_id=?) AND slideshow_pages>0)", // AND access permissions ...
// note, no need to exclude 1 or 2 letter words as the length is too short in any case ...
//    "conference/select/SELECT id FROM conferences WHERE uri=:uri UNION SELECT 0 FROM DUAL WHERE :uri IN (\
    "conference/select/SELECT id FROM conferences WHERE uri=? UNION SELECT 0 FROM DUAL WHERE ? IN (\
'login','logout','plugin','home','admin2548','admin_set_current_user2548','byid',\
'users',\
'blog','support','legal','contact','info','demos','faq','pricing','tour','wp-content','wp-admin','wp-includes',\
'sex','fuck','god',\
'') LIMIT 1",
];
function aq(self, req, res, match, opts)
{
    var uid = self.sessionManager.uid_from_req(req); /* TODO .. at least for present make sure they are logged in */
    if (uid<=0) /* no session */ 
        return he.forbidden(res)
    var act = -1;
    try { act = parseInt(req.body.act); } catch(e) {}
    if (act<0 || act>=aq_commands.length)
        return he.bad(res);
    act = aq_commands[act].split('/',3);
    if (/^(?:select)/.exec(act[1])) {
        self.db.query(act[2], req.body.args && req.body.args.ah || [], function(err, rows, fields){
            if (err) return he.db_error(res, err, act[2]);
            var data = [];
            for(var i=0; i<rows.length; i++) {
                var record = {};
                record[act[0]] = rows[i];
                data.push(record);
                }
            //res.send(JSON.stringify({data: data}));
            res.send(JSON.stringify(data));
/*
Not implemented
[ 'user', 'update' ]
{ act: '3', args: { f: { phone: '+14157025254' }, id: '2' } }
*/
            res.end();
            });
        }
    else if (act[1]=='update') {
        var sql = "UPDATE " + act[0] + "s SET ";    /* add an 's', i.e. pluralize, hack but works in this constrained case */
        var x = req.body.args.f;
        var a = [];
        for(var y in x) {
            a.push("`" + y + "`=" + self.e(x[y]));
            }
        sql += a.join(', ') + " WHERE `id` = " + self.e(req.body.args.id);
        self.db.query(sql, [], function(err, rows, fields){
            if (err) return he.db_error(res, err, sql);
            res.send('{}');
            res.end();
            });
        }
            //res.send(JSON.stringify({data: data}));
    else {
        console.log('Not implemented');
        console.log(act);
        console.log(req.body);
        return he.not_implemented(res);
        }
/*
    console.log(act);
    /.* kinda leaving off here ... *./
    res.send("{}");
    res.end();
*/
}

var routes = [
[/POST:\/signup\/(.)(.)(.*)$/i, signup],
// -- [/(?:GET|POST):\/current_user\/?(.*)$/i, current_user], // --- preserve useful regex for reference
[/GET:\/login$/i, get_current_user],
[/POST:\/login$/i, login],
[/DELETE:\/login$/i, logout],
[/POST:\/logout$/i, logout],    /* synomym for delete login, easier to read/debug in form */
// -- [/GET:\/country$/i, country],
[/GET:\/invitation\/(.*)$/i, invitation],
[/POST:\/_aq$/i, aq],           /* depreciate soon in preference to much specific, secure functions */
// -- [/GET:\/conference_access\/(.*)$/i, conference_access],
[/POST:\/add_self\/(.*)$/i, enter],
[/POST:\/add_participant\/(.*)$/i, enter, {no_cookie: true, create_separate_user:true}],
];

API.prototype = {
    addHandlers: function(express, app, options) {
        var self = this;
        app.use(express.cookieParser());

/* =======================
seems to be  an unresolved issue in express that bad json will cause a stacktrace to be sent to the client (ooch!),
none of the solutions on this thread appear to work ...

http://stackoverflow.com/questions/7478917/catching-illegal-json-post-data-in-express

        app.use(express.bodyParser());
//app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
//app.use(express.errorHandler({ dumpExceptions: false, showStack: false }));
//app.error(function(err,req,res,next) { console.log("ERR"); });
console.log(express.bodyParser());
express.bodyParser.parse['application/json'] = function(data) {
  var result = JSON.parse(data)
  if (typeof result != 'object') {
    throw new Error('Problems parsing JSON')
  }
  return result;
}
//        app.use(express.urlencoded());
======================= */
        app.use(function(req, res, next){
            /* little hack to solve IE8 XDomainRequest not setting content-type */
            /* what we really need to do is to write a custom middleware for json to also solve the 
            problem that it barfs stack traces down the connection */
            if (!req.headers['content-type'])
                req.headers['content-type'] = 'application/json';
            next();
            });
        app.use(express.json());
        app.use(express.urlencoded());      /* TMP todo leave this in temporarily until we yank aq out */
        app.use(function(req, res, next){
            var mo = req.get('X-HTTP-Method-Override');
            req._method = mo ? mo : req.method;
            next();
            });
        app.use(express.logger('short'));

        // *** actually we don't use this anymore as (like most express plugins) it's a colorful flavor of ****, i.e. creates 401 if no Authenticate header
        // we use this to set the value of req.user for later use by session utils
/*        app.use(express.basicAuth(function(user, pass){
            return true;
            })); */

        app.use(function(req, res, next){
            /* most of this copied from: ./node_modules/express/node_modules/connect/lib/middleware/basicAuth.js */
            var a = req.headers.authorization;
            if (!a)
                return next();
            var parts = a.split(' ');
            if (parts.length!==2)
                return next();  // he.bad(req); -- let it wash out ...
            var scheme = parts[0]
                , credentials = new Buffer(parts[1], 'base64').toString()
                , index = credentials.indexOf(':');
            if ('Basic' != scheme)
                return next(); // he.bad(req); -- let it wash out ... 
            if (index<0)
                req.user = credentials;
            else {
                req.user = credentials.slice(0, index);
                req.pass = credentials.slice(index+1);
                }
            next();
            });

        // empty response to top-level 'OK'
        app.get('/', function (req, res) {
            res.send('This is not the page you are looking for.');
            res.end();
            });

        // blunt status -- for use by pingdom et. al.
        app.get('/status', function (req, res) {
            /* put more stuff in here later */
            res.send('OK');
            res.end();
            });

        /* re: access-control-allow ...
        We allow *everything* ... no restrictions on the api as we just don't know whose webpage    
        will be instigating the request -- we have our security elsewhere, not here
        */
        function access_control_allow_origin(req, res) {
            var origin = req.headers['origin'];
            if (origin) {
                res.setHeader('Access-Control-Allow-Origin', origin);
                res.setHeader('Access-Control-Allow-Credentials', true);
//                res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With'); -- what is this?
                }
            }

        app.options(/\/v1\/.*/, function(req, res){
            res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, DELETE');  // this is needed
            if (req.headers['access-control-request-headers']) 
                res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers']);
            access_control_allow_origin(req, res);
            res.end();
            });

        app.all(/^\/v1(\/.*)$/, function(req, res) {
//console.log(req);
            access_control_allow_origin(req, res);
            var found = false
                , path = req.params[0]
                , input
                , match;
            input = (path==='/_dynform' && req.body._dynform_method && req.body._dynform_path && /^\/v1(\/.*)$/.exec(req.body._dynform_path)) ?
                (req.body._dynform_method + ':' + RegExp.$1) :
                (req._method + ':' + path)
            res.setHeader('Content-Type', 'application/json; charset=utf-8');       /* all responses are json */
            res.setHeader('Cache-Control', 'no-cache, max-age=0, must-revalidate'); /* kill caching */
            for(i=0; i<routes.length && !found; i++) {
                if ((match=routes[i][0].exec(input))!==null) {
                    var opts = {}
                    if (routes[i].length>2) {
                        opts = routes[i][2];
                        }
                    found = true;
                        routes[i][1](self, req, res, match, opts);
                    }
                }
            if (!found)
                return self.autoAPI.request(req, res);
            });
        },

    // private
    e: function(str) {
        return this.db.esc(str);
        },
}

module.exports = API;

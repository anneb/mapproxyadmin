#!/usr/bin/env nodejs

const createWmsUrl = require('./wmsurl.js');
const WMSCapabilities = require('wms-capabilities');
const DOMParser = require('@xmldom/xmldom').DOMParser;
const express = require('express');
const app = express();
const fs = require('fs');
const fsPromises = fs.promises;
const jsyaml = require('js-yaml');
const sanitize = require('sanitize-filename');
const config = require('./public/config.json');
const cors =require('cors');

const port = 8083;

app.use(express.static('public'));
app.use(express.json({limit:'5mb'}));
app.use(cors());

app.get('/mapproxylist', (req, res) => {
    fsPromises.readdir(pathJoin([config.mapproxydir,config.mapproxy_projects]), {withFileTypes:true}).then(dir=>{
        const filenames = dir.filter(dirent=>dirent.isFile()&&(dirent.name.endsWith('.yaml')||dirent.name.endsWith('.yml'))).map(dirent=>dirent.name);
        Promise.all(filenames.map(filename=>readYaml(filename))).then(values=>res.json(values));
    }).catch(error=>{
        res.json([{error: error}])
    })
})

app.get('/mapproxyread/:mpconfig', (req, res) => {
    const mpconfig = sanitize(req.params.mpconfig);
    readYaml(mpconfig).then(json=>{
        res.json(json);
    });
})

app.post('/mapproxyupdate/:mpconfig', (req, res) => {
    const mpconfig = sanitize(req.params.mpconfig);
    const yaml = jsyaml.dump(req.body, {styles: {'!!null': ''}});
    fsPromises.writeFile(pathJoin([config.mapproxydir,config.mapproxy_projects,mpconfig]), yaml)
        .then(()=>res.json({name: mpconfig, result: "saved"}))
        .catch((error)=>res.json({name: mpconfig, error: error}));
})

function trashFile(name, number) {
    const trashedPath = pathJoin([config.mapproxydir,config.mapproxy_projects, 'trash',name + number]);
    return fsPromises.stat(trashedPath).then((stat)=>{
        return false; /* file exists */
    }).catch(err=>{
        if (err.code == 'ENOENT') {
            /* file does not exist */
            return fsPromises.rename(pathJoin([config.mapproxydir,config.mapproxy_projects,name]), trashedPath)
            .then(()=>{
                return true;
            })
            .catch(err=>{
                console.log(err);
                return false;
            })
        } else {
            console.log(err);
            return false;
        }
    });
}

app.get('/mapproxydelete/:mpconfig', async (req, res) => {
    const mpconfig = sanitize(req.params.mpconfig);
    json = await readYaml(mpconfig);
    if (json.error) {
        json.name = mpconfig;
        res.json(json);
        return;
    }
    try {
        await fsPromises.mkdir(pathJoin([config.mapproxydir,config.mapproxy_projects,'trash']));
    } catch (err) {
        if (err.code !== 'EEXIST') {
            console.log(err);
            res.json({name:mpconfig, error: JSON.stringify(err)});
            return;
        }
    } finally {
        // clear all caches
        await Promise.all(Object.keys(json.config.caches).map(key=>clearCache(mpconfig,key).then(result=>{
            return;
        })));
    }
    for (let i = 0; i < 300; i++) {
        let result = await trashFile(mpconfig, i);
        if (result) {
            res.json({name:mpconfig, result: "ok"});
            return;
        }
    }
    res.json({name: mpconfig, error: 'move to trash failed, need to empty trash?'});
})

app.get('/mapproxyclearcache/:mpconfig/:cachename', (req, res) => {
    const mpconfig = sanitize(req.params.mpconfig);
    const cachename = sanitize(req.params.cachename);
    clearCache(mpconfig, cachename).then(result=>res.json(result));
});

function pathJoin(parts, sep){
    const separator = sep || '/';
    parts = parts.map((part, index)=>{
        if (index) {
            part = part.replace(new RegExp('^' + separator), '');
        }
        if (index !== parts.length - 1) {
            part = part.replace(new RegExp(separator + '$'), '');
        }
        return part;
    })
    return parts.join(separator);
 }

function clearCache(mpconfig, cachename) {
    return getCachePaths(mpconfig, cachename).then(result=>{
        if (result.error) {
            return {name:mpconfig, error: result.error};
        } else {
            const caches = result.result;
            if (caches.length) {
                return Promise.all(caches.map(path=>{
                    return deleteFolderRecursive(path)
                }))
                .then(()=>{return {name: mpconfig, result: caches}})
                .catch(error=>{return {name: mpconfig, error: error}})
            } else {
                return {name: mpconfig, error: 'cache not found'};
            }
        }
    }).catch(err=>{
        return {name:mpconfig, error: err};
    })
}

function getCachePaths(mpconfig, cachename) {
    return readYaml(mpconfig).then(json=>{
        if (json.error) {
            return json;
        }
        if (!json.config.caches.hasOwnProperty(cachename)) {
            return {name: mpconfig, error: `${cachename} not in ${mpconfig}`}
        }
        if (json.config.caches[cachename].disable_storage) {
            return {name: mpconfig, error: "storage for this cache is disabled"}
        }
        let cacheType = 'file';
        if (json.config.caches[cachename].cache && json.config.caches[cachename].cache.type) {
            const supportedTypes = ['file', 'sqlite']
            cacheType = json.config.caches[cachename].cache.type;
            if (!supportedTypes.includes(cacheType)) {
                return {name: mpconfig, error: `only caches of type ${supportedTypes.join(',')} supported`}
            }
        }
        let appendToCacheName = (cacheType === 'file');
        let grids = json.config.caches[cachename].grids;
        let base_dir = pathJoin([config.mapproxydir,config.mapproxy_cache]);
        if (json.config.globals 
                && json.config.globals.cache 
                && json.config.globals.cache.base_dir) {
            base_dir = json.config.globals.cache.base_dir;
        }
        if (json.config.caches[cachename].base_dir) {
            base_dir = json.config.caches[cachename].base_dir;
        }
        if (json.config.caches[cachename].directory) {
            base_dir = json.config.caches[cachename].directory;
            appendToCacheName = false;
        }
        if (!base_dir.startsWith(config.mapproxydir)) {
            return {name: mpconfig, error: `${base_dir} is outside ${config.mapproxydir}`}
        }
        return fsPromises.readdir(base_dir, {withFileTypes:true})
            .then(dir=>{
                const caches = dir.filter(dirent=>dirent.isDirectory() && dirent.name.startsWith(cachename))
                    .filter(dirent=>{
                        if (!appendToCacheName) {
                            return dirent.name === cachename;
                        }
                        const extra = dirent.name.substr(cachename.length);
                        if (!extra.startsWith('_')){
                            return false;
                        }
                        if (/^_EPSG[0-9]+$/.test(extra)) {
                            return true;
                        }
                        if (grids && grids.length) {
                            return grids.includes(extra.substr(1));
                        }
                        console.log(extra);
                        return false;
                    })
                    .map(dirent=>base_dir + '/' + dirent.name);
                return {name: mpconfig, result: caches}
            })
            .catch(err=>{
                return {name: mpconfig, error: err}
            })
    });
}

function readYaml(mpconfig) {
    const fullpath = pathJoin([config.mapproxydir,config.mapproxy_projects,mpconfig]);
    return fsPromises.readFile(fullpath).then(data=>{
        return {name: mpconfig, config: jsyaml.load(data)};
    }).catch(error=>{
        if (error.code === 'ENOENT') {
            return {name: mpconfig, error: `${mpconfig} not found`}
        }
        return {name: mpconfig, error: error};
    });
}

async function getcapabilities(wmsUrl) {
    const response = await fetch(wmsUrl);       
    if (response.ok) {
        const contentType = response.headers.get('content-type');
        if (contentType && (contentType.startsWith('application/vnd.ogc.wms_xml') || contentType.startsWith('text/xml') || contentType.startsWith('application/xml'))) {
            const text = await response.text();
            const json = new WMSCapabilities(text, DOMParser).toJSON();
            if (!json.Capability) {
                // invalid wms-capabilities
                json.data = text;
            }
            json.wmsurl = wmsUrl;
            return json;
        } else {
            return {'Error': `GetCapababilities content-type should be either xml or vnd.ogc.wms_xml, but ${contentType} returned`, wmsurl: wmsUrl}
        }
    } else {
        return {'Error': `status ${response.status}, ${response.statusText}`, wmsurl: wmsUrl};
    }
}

app.get('/getcapabilities', (req, res) => {
    if (!req.query.wmsurl) {
        return res.json({'Error': 'missing wmsurl parameter'});
    }
    const wmsUrl = createWmsUrl(req.query.wmsurl, 'getcapabilities');
    getcapabilities(wmsUrl)
        .then(json=>{
            res.json(json);
        })
        .catch(error=>{
            res.json({'Error': `${error}`});
        });
});

const deleteFolderRecursive = async path =>  {
    if (fs.existsSync(path)) {
        for (let entry of await fsPromises.readdir(path)) {
            const curPath = path + "/" + entry;
            if ((await fsPromises.lstat(curPath)).isDirectory())
                await deleteFolderRecursive(curPath);
            else await fsPromises.unlink(curPath);
        }
        await fsPromises.rmdir(path);
    }
};

app.listen(port, () => console.log(`Mapproxy Admin API listening on port ${port}`));

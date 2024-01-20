# MapProxyAdmin
Web administrator for mapproxy configurations

[MapProxy](https://mapproxy.org/) is an open source proxy and caching service for WMS, WMTS, TMS and other geospatial data services.

The MapProxy configuration is defined in yaml files. This project, MapProxyAdmin, provides a Web-UI for some common use cases:
* create a new configuration from scratch, based on WMS capabilities
* list the available MapProxy configurations and layers within configurations
* clear the cache for a given layer
* delete configurations

## Install

### Prerequisites
* mapproxy, configured as [MultiMapProxy](https://mapproxy.org/docs/1.11.0/deployment.html#multimapproxy)
* git
* node and npm

It is assumed that the MapProxy configuration resides within the bounds of a single configuration root directory:
/path/to/your/mapproxy/config. The directories for the caches and the MultiMapProxy 
configurations are assumed to be subdirectories of this root directory.

### Steps
1. Get a copy of this repository

        git clone https://github.com/this/repo

2. copy public/config.json.example to public/config.json and edit the following settings to match your system configuration:

        "adminserver" : "http://localhost:8083/",
        "mapproxydir" : "/path/to/root/of/mapproxy",
        "mapproxy_projects": "projects",
        "mapproxy_cache": "mp"

    ***adminserver*** should point to the URL of the mapproxyadmin service, port 8083 is the default port,    
    ***mapproxydir*** should point to the root of your mapproxy configuration directory,  
    ***mapproxy_projects*** defines the name of the subdirectory for the MultiMapProxy configuration,  
    ***mapproxy_cache*** defines the subdirectory that is the root directory for the caches.
3. install dependencies for MapProxyAdmin (index.js)

        npm install

4. start the MapProxyAdmin service

        node index.js

5. open http://localhost:8083 in your browser

For MapProxyAdmin to function properly, it should have permissions to alter files in the cache directories and the MultiMapProxy config directory. This can be achieved by letting node run under the same account as MapProxy. For instance, if MapProxy is running as a wsgi service under Linux Apache, then node should run under account www-data:

        sudo -u www-data node index.js

For security, it is strongly advised to thoroughly restrict access to MapProxyAdmin. Users can easily destroy your MapProxy configuration or may find ways to change files on your file system (although some basic measures were taken to try to prevent this).

## Develop
The dependency on Polymer for the webcomponents has been removed. The webclient now uses bundled lit code from cdn.jsdelivr.net









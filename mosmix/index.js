
const axios = require('axios'),
    unzipper = require('unzipper'),
    sax = require('sax');

var LineTransform = require('node-line-reader').LineTransform;  // LineTransform constructor
var LineFilter = require('node-line-reader').LineFilter;  // LineFilter constructor
var transform = new LineTransform();

const readStationCatalog=async ({logger=console})=>{    
    URL ="https://www.dwd.de/DE/leistungen/met_verfahren_mosmix/mosmix_stationskatalog.cfg?view=nasPublication&nn=16102"
    logger.debug('Downloading station catalog');
    const stations=[]
    const transform = new LineTransform();
    // Skip empty lines and lines with "et" (with leading and trailing space) in them
    transform.on('data', function (line) {
        if (line.length == 0 || line.indexOf("TABLE") == 0 || line.indexOf("clu") == 0 || line.indexOf("=") == 0)
            return;
        const station={
            clu:line.substr(0, 5).trim(),
            CofX: line.substr(5, 5).trim(),
            id: line.substr(12, 5).trim(),
            ICAO: line.substr(18, 4).trim(),
            name: line.substr(23, 20).trim(),
            nb: Number.parseFloat(line.substr(44, 6)),
            el: Number.parseFloat(line.substr(52, 6)),
            elev: Number.parseInt(line.substr(59, 5)),
            hmodH: Number.parseInt(line.substr(65, 6)),
            type: line.substr(72, 4)
        }
        stations.push(station)
    });
    return new Promise((resolve, reject) => {
        // @ts-ignore
        axios({
            method: 'get',
            url: URL,
            responseType: 'stream'
        }).then((response) => {
            logger.debug('Parsing stations');
            response.data.pipe(transform)
                .on('error', reject)
                .on('end', () => {
                    resolve(stations);
                });
        }).catch((error) => {
            if (error.response && error.response.status == 404) {
                reject(new Error('dwdweather.warn.noDataForStation'));
            } else {
                reject(error);
            }
        });
    });
}
const readElementDefinition = async({ logger = console })=>{
    const URL ='https://opendata.dwd.de/weather/lib/MetElementDefinition.xml';
    logger.debug('Downloading MetElementDefinition');

    const definition = {
    };


    const xmlTagStack = [];
    const xmlStreamParser = sax.createStream(true, {
        'trim': true
    });

    xmlStreamParser.onopentag = (tag) => {
        if (!tag.isSelfClosing) {
            xmlTagStack.push(tag);
        }
    };
    xmlStreamParser.onclosetag = (_tag) => {
        xmlTagStack.pop();
    };

    let currentShortName;
    xmlStreamParser.ontext = (text) => {
        if (xmlTagStack.length) {
            const currentTag = xmlTagStack[xmlTagStack.length - 1];
            if (xmlTagStack.length >= 2) {
                const enclosingTag = xmlTagStack[xmlTagStack.length - 2];
                if (enclosingTag.name == 'MetElement'){
                    if (currentTag.name=='ShortName'){
                        currentShortName=text;
                        definition[text]={};
                    } else if (currentShortName){
                        if (currentTag.name == "UnitOfMeasurement"){
                            if (text == "0°..360°")
                            {
                                definition[currentShortName].min = 0
                                definition[currentShortName].max = 360
                                text = "°"   
                            }
                            // "% (0..80)".match(/\(?([0-9]).*?([0-9][0-9])\)/) => [1]=0 [2]=80
                            var tokens = text.match(/\(?([0-9]+).*?([0-9]+)\)/)
                            if (Array.isArray(tokens) && tokens.length==3){
                                definition[currentShortName].min = parseInt(tokens[1])
                                definition[currentShortName].max = parseInt(tokens[2])
                                text=text.replace(/\(.*\)/,"").trim()                                
                            }
                            if (text == "-")
                                text = ""
                        }
                        definition[currentShortName][currentTag.name]=text;
                    }
                }
            }
        }
    };
    return new Promise((resolve, reject) => {
        // @ts-ignore
        axios({
            method: 'get',
            url: URL,
            responseType: 'stream'
        }).then((response) => {
            logger.debug('Parsing station data');
            response.data.pipe(xmlStreamParser)
                .on('error', reject)
                .on('end', () => {
                    resolve(definition);
                });
        }).catch((error) => {
            if (error.response && error.response.status == 404) {
                reject(new Error('dwdweather.warn.noDataForStation'));
            } else {
                reject(error);
            }
        });
    });
};
const readStationForecast = async({ stationId,logger = console})=>{
    const MOSMIX_URL = `https://opendata.dwd.de/weather/local_forecasts/mos/MOSMIX_L/single_stations/${stationId}/kml/MOSMIX_L_LATEST_${stationId}.kmz`;
    logger.debug('Downloading station data');

    const weatherForecast = {
        stationId: stationId,
        times: [],
        forecast:{}
    };


    const xmlTagStack = [];
    const xmlStreamParser = sax.createStream(true, {
        'trim': true
    });

    xmlStreamParser.onopentag = (tag) => {
        if (!tag.isSelfClosing) {
            xmlTagStack.push(tag);
        }
    };
    xmlStreamParser.onclosetag = (_tag) => {
        xmlTagStack.pop();
    };
    xmlStreamParser.ontext = (text) => {
        if (xmlTagStack.length) {
            const currentTag = xmlTagStack[xmlTagStack.length - 1];
            if (xmlTagStack.length >= 2) {
                const enclosingTag = xmlTagStack[xmlTagStack.length - 2];
                switch(enclosingTag.name){
                    case 'dwd:ForecastTimeSteps':
                        if (currentTag.name == 'dwd:TimeStep')
                            // @ts-ignore
                            weatherForecast.times.push(new Date(text));
                        break;
                    case 'kml:Point':
                        if (currentTag.name == 'kml:coordinates') {
                            const coords = text.split(',');
                            weatherForecast.coordinates = {
                                longitude: coords[0],
                                latitude: coords[1],
                                height: coords[2]
                            };
                        }
                        break;
                    case 'dwd:ProductDefinition':
                    case 'kml:Placemark':
                        {
                            const name = currentTag.name.split(':')[1].toLowerCase();
                            weatherForecast.placemark = weatherForecast.placemark || {};
                            weatherForecast.placemark[name]=text;
                        }
                        break;

                    case 'dwd:Forecast':
                        if (currentTag.name == 'dwd:value'){
                            const name = enclosingTag.attributes['dwd:elementName'];
                            weatherForecast.forecast[name] = text.split(/\s+/).map(v => {
                                Number.parseFloat(v);
                            });
                        }
                        break;
                }
                if (enclosingTag.name == 'dwd:Forecast' && enclosingTag.attributes['dwd:elementName']) {
                    weatherForecast.forecast[enclosingTag.attributes['dwd:elementName']] = text.split(/\s+/).map(v => {
                        return Number.parseFloat(v);
                    });
                }
            }
        }
    };
    return new Promise((resolve, reject) => {
        // @ts-ignore
        axios({
            method: 'get',
            url: MOSMIX_URL,
            responseType: 'stream'
        }).then((response) => {
            logger.debug('Parsing station data');
            response.data.pipe(unzipper.ParseOne(/\.kml/i))
                .on('error', reject)
                .pipe(xmlStreamParser)
                .on('error', reject)
                .on('end', () => {
                    resolve(weatherForecast);
                });
        }).catch((error) => {
            if (error.response && error.response.status == 404) {
                reject(new Error('dwdweather.warn.noDataForStation'));
            } else {
                reject(error);
            }
        });
    });
};

const indexedForecastData=async({forecastData,definition=null})=>{
    return new Promise(async(resolve,reject)=>{
        try{
            const result={
                header:{
                    ...forecastData.placemark,
                    coordinates: forecastData.coordinates
                },
                definition
            }
            Object.keys(result.definition).forEach(key=>{
                result.definition[key]={
                    ...result.definition[key],
                    UnitOfMeasurement: result.definition[key].UnitOfMeasurement.replace("% (0..100)", "%").replace("0°..360°","°")
                }
            })
            result.forecast=forecastData.times.map((time,index)=>{
                const data={
                    index:index,
                    time: time,
                }
                Object.keys(forecastData.forecast).forEach(key=>{
                    if (definition){
                        const value = forecastData.forecast[key][index]
                        data[key] = {
                            raw: value,
                            string: `${Number.isNaN(value) ? "---" : value} ${definition[key].UnitOfMeasurement}`
                        }
                    }
                    else{
                        data[key] = forecastData.forecast[key][index]
                    }
                })

                return data
            })
            
            return resolve(result)
        } catch(err){
            reject(err)
        }
    })
}

module.exports={
    readStationForecast : readStationForecast,
    readStationCatalog: readStationCatalog,
    readElementDefinition: readElementDefinition,
    indexedForecastData: indexedForecastData
};

const fs = require('fs')
const path = require('path')
const mosmix = require('../../index').mosmix

mosmix.readStationForecast({stationId:"Q811"}).then(forecastData => {
    console.log(forecastData)
    fs.writeFileSync(path.join(__dirname, "forecast.json"), JSON.stringify(forecastData,null,"\t"))
    mosmix.readElementDefinition({}).then(definition => {
        mosmix.indexedForecastData({ forecastData, definition}).then(forecast=>{
            fs.writeFileSync(path.join(__dirname, "forecast-indexed.json"), JSON.stringify(forecast, null, "\t"))
        })
    })
})
const fs = require('fs')
const path = require('path')
const mosmix=require('../../index').mosmix

mosmix.readStationCatalog({}).then(catalog=>{
    console.log(catalog)
    fs.writeFileSync(path.join(__dirname, "catalog.json"), JSON.stringify(catalog, null, "\t"))
})
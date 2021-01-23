const fs = require('fs')
const path = require('path')
const mosmix = require('../../index').mosmix

mosmix.readElementDefinition({}).then(definition => {
    console.log(definition)
    fs.writeFileSync(path.join(__dirname, "definition.json"), JSON.stringify(definition, null, "\t"))
})
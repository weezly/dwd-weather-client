const fetch = require('node-fetch')
const fs=require('fs')
const path = require('path')

let errCount
const summary={}
const exec=async()=>{
    
    let done=0
    let promises=[]
    for (let i = 1;i<2556;i++){
        let result=fetch(`https://np.radioplayer.de/qp/v3/onair?rpIds=${i}&nameSize=200&artistNameSize=200&descriptionSize=10000`).then(async result=>{
            result=result.text().then(text=>{
                try{
                    let match = text.match(/\((.*)\)/)
                    if (match.length>1){
                        errCount=0
                        const data=JSON.parse(match[1])
                        // console.log(data)
                        if (data.responseStatus == "SUCCESS" && data.total>0){
                            let i = Object.keys(data.results)[0]
                            summary[i] = {}
                            for (var idx = 0;idx<data.total;idx++){
                                const item = data.results[i][idx]
                                switch (item.type){
                                    case "SI":
                                        summary[i].station = item
                                        // {
                                        //     name:item.serviceName,
                                        //     description: item.description,
                                        //     img: item.imageUrl
                                        // }
                                        break
                                    case "PE_E":
                                        summary[i].song = summary[i].song || []
                                        summary[i].song.push(
                                            item
                                            // {
                                            // artist:item.artistName,
                                            // name: item.name,
                                            // img: item.imageUrl,
                                            // startTime: item.startTime,
                                            // stopTime: item.stopTime,
                                            // }
                                        )
                                        // console.log(`${i}: ${item.artistName} - ${item.name} => ${item.serviceName}`)
                                        break
                                    default:
                                        break;
                                }
                                
                            }
                        }
                        else
                            errCount++
                    }     
                    else
                        console.log(text)       
                }catch(err){
                    // discard.push(i)
                    errCount++                    
                }
                return (errCount < 10)
            })
            done++
            return result
        }).catch(err=>{
            console.error(err)
        })
        promises.push(result)
        if(promises.length==100){
            await Promise.allSettled(promises)
            promises=[]
        }
        // if (!result)
        //     break
    }
    if (promises.length) {
        await Promise.allSettled(promises)
        promises = []
    }
    fs.writeFileSync(path.join(__dirname, "snapshot.json"), JSON.stringify(summary))
    console.log(summary)
}
exec()

return
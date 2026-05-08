const formattedTime = (endTime) => {
   return endTime? new Date(endTime).toLocaleString('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'America/Los_Angeles'
    }) : '';
}



module.exports = {
    formattedTime
}
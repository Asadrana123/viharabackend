const { MongoClient } = require('mongodb');

// Replace with your MongoDB connection string (e.g., from env)
const MONGODB_URI = 'mongodb+srv://asadlukman246:LIKDqLwFSRduMu3W@cluster0.aezmvdu.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0'; // e.g., process.env.MONGODB_URI
const DB_NAME = 'test'; // e.g., 'vihara'
const COLLECTION_NAME = 'productmodels'; // Updated to your collection name

async function updateAuctionDates() {
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log('Connected to MongoDB');
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    // Fetch all properties (no filter for status)
    const properties = await collection.find({}).toArray();
    console.log(`Found ${properties.length} properties to update.`);

    // Define date range: Aug 1, 2025 to Jan 31, 2026 (~6 months)
    const minDate = new Date('2025-08-01T00:00:00.000Z');
    const maxDate = new Date('2026-01-31T23:59:59.999Z');

    // Generate all possible dates in the range
    const allDates = [];
    let currentDate = new Date(minDate);
    while (currentDate <= maxDate) {
      allDates.push(new Date(currentDate));
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Shuffle the dates for randomness
    allDates.sort(() => Math.random() - 0.5);

    // Take the first N random unique dates (N = properties.length)
    const randomStartDates = allDates.slice(0, properties.length);

    // Prepare bulk update operations
    const bulkOps = [];
    properties.forEach((property, index) => {
      // Set start date to 10:00 UTC
      const startDate = new Date(randomStartDates[index]);
      startDate.setUTCHours(10, 0, 0, 0);

      // End date: start + 180 days, at 17:00 UTC
      const endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 180);
      endDate.setUTCHours(17, 0, 0, 0);

      // Add update operation
      bulkOps.push({
        updateOne: {
          filter: { _id: property._id },
          update: {
            $set: {
              auctionStartDate: startDate.toISOString(),
              auctionEndDate: endDate.toISOString(),
              auctionStartTime: '10:00',
              auctionEndTime: '17:00'
            }
          }
        }
      });
    });

    // Execute bulk update
    if (bulkOps.length > 0) {
      const result = await collection.bulkWrite(bulkOps);
      console.log(`Updated ${result.modifiedCount} properties successfully.`);
    } else {
      console.log('No properties found to update.');
    }
  } catch (error) {
    console.error('Error updating auction dates:', error);
  } finally {
    await client.close();
    console.log('Disconnected from MongoDB');
  }
}

updateAuctionDates();
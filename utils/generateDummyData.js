// utils/generateDummyData.js
const fs = require('fs').promises;
const path = require('path');

// Function to generate random user data with demographic information
function generateDummyUsers(count = 300) {
  const firstNames = [
    'James', 'Mary', 'John', 'Patricia', 'Robert', 'Jennifer', 'Michael', 'Linda',
    'William', 'Elizabeth', 'David', 'Susan', 'Richard', 'Jessica', 'Joseph', 'Sarah',
    'Thomas', 'Karen', 'Charles', 'Nancy', 'Christopher', 'Lisa', 'Daniel', 'Margaret',
    'Matthew', 'Betty', 'Anthony', 'Sandra', 'Mark', 'Ashley', 'Donald', 'Kimberly',
    'Steven', 'Emily', 'Paul', 'Donna', 'Andrew', 'Michelle', 'Joshua', 'Carol',
    'Kenneth', 'Amanda', 'Kevin', 'Dorothy', 'Brian', 'Melissa', 'George', 'Deborah',
    'Timothy', 'Stephanie', 'Ronald', 'Rebecca', 'Jason', 'Sharon', 'Edward', 'Laura',
    'Jeffrey', 'Cynthia', 'Ryan', 'Kathleen', 'Jacob', 'Amy', 'Gary', 'Angela',
    'Nicholas', 'Shirley', 'Eric', 'Brenda', 'Jonathan', 'Emma', 'Stephen', 'Anna',
    'Larry', 'Pamela', 'Justin', 'Nicole', 'Scott', 'Samantha', 'Brandon', 'Katherine',
    'Benjamin', 'Helen', 'Samuel', 'Christine', 'Gregory', 'Debra', 'Alexander', 'Rachel',
    'Patrick', 'Carolyn', 'Frank', 'Janet', 'Raymond', 'Maria', 'Jack', 'Catherine',
    'Dennis', 'Heather', 'Jerry', 'Diane', 'Tyler', 'Olivia', 'Aaron', 'Julie',
    'Jose', 'Joyce', 'Adam', 'Victoria', 'Nathan', 'Kelly', 'Henry', 'Christina',
    'Zachary', 'Lauren', 'Douglas', 'Joan', 'Peter', 'Evelyn', 'Kyle', 'Judith'
  ];

  const lastNames = [
    'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
    'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson',
    'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson',
    'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson', 'Walker',
    'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores',
    'Green', 'Adams', 'Nelson', 'Baker', 'Hall', 'Rivera', 'Campbell', 'Mitchell',
    'Carter', 'Roberts', 'Gomez', 'Phillips', 'Evans', 'Turner', 'Diaz', 'Parker',
    'Cruz', 'Edwards', 'Collins', 'Reyes', 'Stewart', 'Morris', 'Morales', 'Murphy',
    'Cook', 'Rogers', 'Gutierrez', 'Ortiz', 'Morgan', 'Cooper', 'Peterson', 'Bailey',
    'Reed', 'Kelly', 'Howard', 'Ramos', 'Kim', 'Cox', 'Ward', 'Richardson', 'Watson',
    'Brooks', 'Chavez', 'Wood', 'James', 'Bennett', 'Gray', 'Mendoza', 'Ruiz', 'Hughes',
    'Price', 'Alvarez', 'Castillo', 'Sanders', 'Patel', 'Myers', 'Long', 'Ross',
    'Foster', 'Jimenez', 'Powell', 'Jenkins', 'Perry', 'Russell', 'Sullivan', 'Bell',
    'Coleman', 'Butler', 'Henderson', 'Barnes', 'Gonzales', 'Fisher', 'Vasquez', 'Simmons'
  ];

  const domains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'aol.com', 'mail.com'];
  
  const counties = [
    { name: 'Los Angeles', state: 'CA' },
    { name: 'Cook', state: 'IL' },
    { name: 'Harris', state: 'TX' },
    { name: 'Maricopa', state: 'AZ' },
    { name: 'San Diego', state: 'CA' },
    { name: 'Orange', state: 'CA' },
    { name: 'Miami-Dade', state: 'FL' },
    { name: 'Dallas', state: 'TX' },
    { name: 'King', state: 'WA' },
    { name: 'Clark', state: 'NV' },
    { name: 'Queens', state: 'NY' },
    { name: 'San Bernardino', state: 'CA' },
    { name: 'Riverside', state: 'CA' },
    { name: 'Tarrant', state: 'TX' },
    { name: 'Bexar', state: 'TX' }
  ];

  const ageRanges = ['18-24', '25-34', '35-44', '45-54', '55-64', '65+'];
  const genders = ['Male', 'Female'];
  const incomeLevels = ['100K-500K', '500K-1M', '1M-5M', '5M+'];
  const transportationModes = ['Car', 'Truck', 'Van', 'Public Transit', 'Walk/Bike', 'Work from Home'];
  const maritalStatuses = ['Married', 'Single', 'Divorced', 'Widowed', 'Separated'];
  const employmentStatuses = ['Employed', 'Self-employed', 'Unemployed', 'Retired', 'Student'];

  const users = [];

  for (let i = 0; i < count; i++) {
    const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
    const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
    const domain = domains[Math.floor(Math.random() * domains.length)];
    const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${Math.floor(Math.random() * 1000)}@${domain}`;
    
    // Generate a US-style phone number
    const areaCode = Math.floor(Math.random() * 800) + 200;
    const prefix = Math.floor(Math.random() * 900) + 100;
    const lineNumber = Math.floor(Math.random() * 9000) + 1000;
    const phone = `(${areaCode}) ${prefix}-${lineNumber}`;
    
    const county = counties[Math.floor(Math.random() * counties.length)];
    const location = `${county.name}, ${county.state}`;
    
    const user = {
      id: i + 1,
      firstName,
      lastName,
      email,
      phone,
      demographic: {
        ageRange: ageRanges[Math.floor(Math.random() * ageRanges.length)],
        sex: genders[Math.floor(Math.random() * genders.length)],
        location,
        incomeLevel: incomeLevels[Math.floor(Math.random() * incomeLevels.length)],
        transportation: transportationModes[Math.floor(Math.random() * transportationModes.length)],
        maritalStatus: maritalStatuses[Math.floor(Math.random() * maritalStatuses.length)],
        employmentStatus: employmentStatuses[Math.floor(Math.random() * employmentStatuses.length)]
      }
    };
    
    users.push(user);
  }

  return users;
}

// Export the function to generate dummy data
module.exports = { generateDummyUsers };

// When running this file directly, generate and save the data
if (require.main === module) {
  (async () => {
    try {
      const users = generateDummyUsers(350);
      const dataPath = path.join(__dirname, '../data');
      
      // Ensure data directory exists
      try {
        await fs.mkdir(dataPath, { recursive: true });
      } catch (err) {
        if (err.code !== 'EEXIST') throw err;
      }
      
      // Write the generated users to a JSON file
      await fs.writeFile(
        path.join(dataPath, 'dummyUsers.json'), 
        JSON.stringify(users, null, 2)
      );
      
      console.log(`Successfully generated ${users.length} dummy users.`);
    } catch (error) {
      console.error('Error generating dummy data:', error);
    }
  })();
}
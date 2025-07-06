// Exploring Notion's conditional formatting capabilities

console.log('=== Notion Conditional Formatting Options ===\n');

// Option 1: Title formulas with emojis (closest to conditional formatting)
console.log('OPTION 1: Modified Name field with conditional formatting');
console.log('Unfortunately, Notion does NOT support:');
console.log('❌ Conditional text colors');
console.log('❌ Conditional background colors'); 
console.log('❌ True conditional formatting like Excel');
console.log('❌ Dynamic styling of existing properties');

console.log('\nHowever, there are creative workarounds...\n');

// Option 2: Formula-based name with indicators
console.log('OPTION 2: Formula property that mimics the Name with indicators');
console.log('Create a "Display Name" formula property:');

const displayNameFormula = `
if(
  length(prop("Blocking")) > 0 and length(prop("Blocked by")) > 0,
  "🟠🔴 " + prop("Name"),
  if(
    length(prop("Blocking")) > 0,
    "🟠 " + prop("Name"),
    if(
      length(prop("Blocked by")) > 0,
      "🔴 " + prop("Name"),
      prop("Name")
    )
  )
)`;

console.log(displayNameFormula);
console.log('\nResult examples:');
console.log('🟠🔴 Task Name - Blocks others AND is blocked');
console.log('🟠 Task Name - Blocks other tasks');
console.log('🔴 Task Name - Blocked by other tasks');
console.log('Task Name - No blocking relationships');

console.log('\nThen you can:');
console.log('1. Hide the original "Name" column');
console.log('2. Use "Display Name" as your primary view');
console.log('3. Get visual indicators without extra columns');

// Option 3: Select property with colored backgrounds
console.log('\n\nOPTION 3: Status property with colored backgrounds');
console.log('Create a "Task Status" select property with:');

const statusOptions = [
  { name: '🟠 Blocking', color: 'orange' },
  { name: '🔴 Blocked', color: 'red' },
  { name: '🟡 Both', color: 'yellow' },
  { name: '✅ Clear', color: 'green' }
];

statusOptions.forEach(option => {
  console.log(`"${option.name}" with ${option.color} background`);
});

console.log('\nPros: Actual colored backgrounds');
console.log('Cons: Manual maintenance required');

// Option 4: Template approach
console.log('\n\nOPTION 4: Template-based naming convention');
console.log('When creating tasks, use naming conventions:');
console.log('🟠 [Task Name] - for blocking tasks');
console.log('🔴 [Task Name] - for blocked tasks');
console.log('🟡 [Task Name] - for both');
console.log('\nPros: Simple, works immediately');
console.log('Cons: Manual maintenance, not automatic');

// Option 5: Database views with filters
console.log('\n\nOPTION 5: Filtered database views');
console.log('Create multiple views of the same database:');
console.log('📋 "All Tasks" - Shows everything');
console.log('🟠 "Blocking Tasks" - Filter: Blocking is not empty');
console.log('🔴 "Blocked Tasks" - Filter: Blocked by is not empty');
console.log('✅ "Ready Tasks" - Filter: Both Blocking and Blocked by are empty');
console.log('\nPros: Clean separation, no extra columns');
console.log('Cons: Need to switch between views');

console.log('\n=== BEST SOLUTION FOR YOUR NEEDS ===');
console.log('OPTION 2: Formula-based "Display Name"');
console.log('\nSteps:');
console.log('1. Add formula property called "📋 Task"');
console.log('2. Use the formula above to show indicators + name');
console.log('3. Hide the original "Name" column');
console.log('4. Reorder "📋 Task" to be first column');
console.log('5. Get conditional formatting effect without extra visible columns');

console.log('\nThis gives you:');
console.log('✅ Visual indicators in the task name');
console.log('✅ No extra visible columns');
console.log('✅ Automatic updates');
console.log('✅ Clean, Excel-like conditional formatting feel');
// Design visual blocking indicators for Notion

console.log('=== Visual Blocking Indicator Design ===\n');

// Option 1: Single "Dependency Status" property with colored indicators
const singlePropertyFormula = `
if(
  length(prop("Blocking")) > 0 and length(prop("Blocked by")) > 0,
  "🟠🔴 Blocks & Blocked",
  if(
    length(prop("Blocking")) > 0,
    "🟠 Blocking others",
    if(
      length(prop("Blocked by")) > 0,
      "🔴 Blocked by others",
      "⚪ No dependencies"
    )
  )
)`;

console.log('OPTION 1: Single "Dependency Status" formula property:');
console.log(singlePropertyFormula);
console.log('\nThis would show:');
console.log('🟠🔴 Blocks & Blocked - Task both blocks others AND is blocked');
console.log('🟠 Blocking others - Task is blocking other tasks');
console.log('🔴 Blocked by others - Task is blocked by other tasks');
console.log('⚪ No dependencies - Task has no blocking relationships');

// Option 2: Two separate properties for cleaner view
const blockingFormula = `
if(
  length(prop("Blocking")) > 0,
  "🟠 " + format(length(prop("Blocking"))) + " task(s)",
  ""
)`;

const blockedByFormula = `
if(
  length(prop("Blocked by")) > 0,
  "🔴 " + format(length(prop("Blocked by"))) + " blocker(s)",
  ""
)`;

console.log('\n\nOPTION 2: Two separate formula properties:');
console.log('\n"Is Blocking" formula:');
console.log(blockingFormula);
console.log('\n"Is Blocked By" formula:');
console.log(blockedByFormula);
console.log('\nThis would show:');
console.log('🟠 2 task(s) - When blocking 2 tasks');
console.log('🔴 1 blocker(s) - When blocked by 1 task');
console.log('(empty) - When no relationships');

// Option 3: Enhanced with task names (more complex but informative)
const enhancedFormula = `
if(
  length(prop("Blocking")) > 0 and length(prop("Blocked by")) > 0,
  "🟠 Blocking " + format(length(prop("Blocking"))) + " | 🔴 Blocked by " + format(length(prop("Blocked by"))),
  if(
    length(prop("Blocking")) > 0,
    "🟠 Blocking " + format(length(prop("Blocking"))) + " task(s)",
    if(
      length(prop("Blocked by")) > 0,
      "🔴 Blocked by " + format(length(prop("Blocked by"))) + " task(s)",
      "✅ Ready"
    )
  )
)`;

console.log('\n\nOPTION 3: Enhanced single property with counts:');
console.log(enhancedFormula);
console.log('\nThis would show:');
console.log('🟠 Blocking 2 | 🔴 Blocked by 1 - Task both blocks and is blocked');
console.log('🟠 Blocking 3 task(s) - Task is blocking 3 tasks');
console.log('🔴 Blocked by 1 task(s) - Task is blocked by 1 task');
console.log('✅ Ready - Task has no blocking relationships');

// Option 4: Status property with colored options (manual but very visual)
console.log('\n\nOPTION 4: Status property with colored options:');
console.log('Create a "Blocking Status" select property with options:');
console.log('🟠 "Blocking Others" (Orange background)');
console.log('🔴 "Blocked" (Red background)');
console.log('🟡 "Both" (Yellow background)');
console.log('✅ "Clear" (Green background)');
console.log('📋 "Review" (Gray background)');
console.log('\nPros: Very visual, colored backgrounds');
console.log('Cons: Manual maintenance required');

console.log('\n=== RECOMMENDATION ===');
console.log('Start with OPTION 2 (two separate properties):');
console.log('1. More granular visibility');
console.log('2. Cleaner visual separation');
console.log('3. Shows exact counts');
console.log('4. Easy to scan in list view');

console.log('\nTo implement:');
console.log('1. Add "🟠 Is Blocking" formula property');
console.log('2. Add "🔴 Is Blocked By" formula property');
console.log('3. Both will automatically update when relationships change');
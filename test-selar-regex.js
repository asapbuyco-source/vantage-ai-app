const bodyText = `
Selar <receipts@selar.co>
8:26 AM (15 minutes ago)
to me

Selar.co Logo
Congratulations vantage AI

You just made a sale!🚀
 
Summary:
Elite Monthly Access copy x 1

CFA 0
 
Subtotal	CFA 0
Total	CFA 0
 
Customer information

Bio Data
vantage AI
asapbuyco@gmail.com
+237670522485

Transaction information
Payment Date (GMT+1)
March 1st, 2026
`;

console.log("--- TEST PARSING ---");
const emailMatch = bodyText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);

let customerEmail = null;
if (emailMatch) {
    for (const em of emailMatch) {
        if (!em.includes('selar.co')) {
            customerEmail = em.toLowerCase().trim();
            break;
        }
    }
}

const isMonthly = bodyText.toLowerCase().includes('monthly');
const isWeekly = bodyText.toLowerCase().includes('weekly');
const isDaily = bodyText.toLowerCase().includes('daily');
const isAnnual = bodyText.toLowerCase().includes('annual');

let plan = 'monthly';
if (isDaily) plan = 'daily';
if (isWeekly) plan = 'weekly';
if (isMonthly) plan = 'monthly';
if (isAnnual) plan = 'annual';

console.log("Found Email:", customerEmail);
console.log("Found Plan:", plan);

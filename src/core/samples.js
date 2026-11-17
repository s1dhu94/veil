// FICTIONAL sample documents. Every name, number and address here is invented for the demo.
// Numbers are built to pass checksums (Aadhaar Verhoeff, card Luhn) so detection is exercised for real;
// the card number is the public 4111... test number and the Aadhaar is not a real person's.

export const SAMPLES = [
  {
    id: 'bank',
    title: 'Card fraud dispute',
    blurb: 'A bank asks for documents after a disputed payment',
    task: 'actions',
    text: `Subject: Dispute ref DSP-448812 - unauthorised transaction

Dear Arjun Mehta,

We have received your complaint about a debit of Rs 48,750 on 12/11/2026 on your credit card 4111 1111 1111 1111 at "QUICKMART ONLINE".

To continue the investigation, please submit within 7 days:
1. A signed dispute form
2. A copy of your PAN card (ABCPM1234K) and Aadhaar (2345 6789 0124)
3. Your registered mobile number 98765 43210 must remain reachable

If we do not receive these by 24/11/2026 the dispute will be closed and the amount will be treated as valid. Any refund will be credited to savings account no. 50100123456789, IFSC HDFC0001234.

You can also write to disputes@examplebank.in.

Regards,
Neha Kulkarni
Card Services, Example Bank`,
  },
  {
    id: 'lab',
    title: 'Lab report',
    blurb: 'A blood test with a few flagged values',
    task: 'explain',
    text: `CITYCARE DIAGNOSTICS - LABORATORY REPORT
Patient: Kavya Rao        Age/Sex: 34 / F
DOB: 03/08/1992           Patient ID: CCD-2026-77104
Referred by: Dr. Sameer Iyer
Phone: +91 91234 56780

Test                     Result     Reference range
HbA1c                    6.1 %      4.0 - 5.6
Fasting glucose          112 mg/dL  70 - 99
TSH                      5.8 mIU/L  0.4 - 4.0
Vitamin D (25-OH)        14 ng/mL   30 - 100
Haemoglobin              11.2 g/dL  12.0 - 15.5

Remarks: Prediabetic range for HbA1c. Suggest repeat TSH with free T4. Follow up with physician.`,
  },
  {
    id: 'rent',
    title: 'Rent increase notice',
    blurb: 'A landlord raises rent and changes deposit terms',
    task: 'reply',
    text: `NOTICE OF RENT REVISION

To: Mr. Rohan Das, Flat 4B, Lotus Residency, 12th Cross, Indiranagar, Bengaluru 560038

This is to inform you that with effect from 1 January 2027 the monthly rent for the above flat will increase from Rs 28,000 to Rs 34,000. The security deposit will also be revised to ten months' rent, and the additional amount must be paid by 15/12/2026.

Maintenance charges of Rs 2,500 per month will now be payable separately. Please confirm acceptance by replying to this notice. If I do not hear from you, I will assume you agree.

Contact: Smt. Lakshmi Narayan, 99001 22334, lakshmi.n@example.com

Landlord
Lakshmi Narayan`,
  },
];

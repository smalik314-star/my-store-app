# India compliance checklist

This file records product controls, not legal or tax advice. Store owners remain
responsible for their registration type, product classification, tax rate,
licences, return filing and professional review.

## Implemented controls

- Sale invoice numbers are consecutive and unique by Indian financial year.
- Estimates use a separate `EST` series and never post stock, receivables,
  ledgers, invoice usage or GST.
- Estimates print `ESTIMATE`, `NOT A TAX INVOICE`, zero GST and no-ITC wording.
- GST can be collected only when Store Settings identifies a regular taxpayer,
  GST mode is enabled and a GSTIN is present.
- Composition mode prints `BILL OF SUPPLY` and the required non-collection
  wording. Unregistered mode does not print a tax invoice.
- Store identity supports GSTIN, state/state code and drug-licence number.
- AATO at or above ₹5 crore shows an e-invoice applicability warning. The app
  does not fabricate IRNs or signed QR codes; those require an authorized IRP.
- Existing invoice records and document identifiers are not rewritten.

## Production checks still owned by each pharmacy

- Confirm GST registration type, GSTIN, legal name/address, state code and drug
  licence before issuing documents.
- Maintain current HSN and GST rate per medicine/product; the software must not
  guess legal classification from the medicine name.
- Confirm whether e-invoicing applies and connect an authorized IRP before
  issuing covered B2B documents.
- Use posted sale returns/credit-note records rather than deleting invoices.
- Maintain required prescriptions and Schedule H/H1/X records outside or in an
  approved integrated workflow according to the pharmacy licence.
- Publish a privacy notice and retention/deletion process for customer personal
  data as applicable under the DPDP Act and commencement notifications.

## Official reference points

- CGST Rules, tax invoice / credit and debit note rules (CBIC)
- Notification 78/2020-Central Tax for HSN digits (CBIC)
- E-invoice mandate and reporting timelines (GST Invoice Registration Portal)
- Drugs Rules, 1945 (CDSCO)
- Digital Personal Data Protection Act, 2023 and Rules, 2025 (MeitY)

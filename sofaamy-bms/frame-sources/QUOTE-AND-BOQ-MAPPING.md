# Sofaamy quotation and internal BOQ mapping

This note records how the system maps the supplied company evidence into two different documents.

## 1. Customer quotation

The customer-facing PDF follows the supplied Excel quotation style, but adds traceability:

- Sofaamy header and quotation number
- client name, phone/email when supplied, site/location, design reference and date
- quote validity date (default: 3 days)
- job description and profile/colour description
- one line per opening with description, width, height, quantity, m², unit rate and total
- subtotal, negotiated discount, GETF + NHIS, VAT and grand total
- deposit and balance terms, installation scheduling, payment methods and final site-verification note

Internal material, labour, profile, glass and margin values are intentionally not printed in this document.

## 2. Internal Bill of Quantities and cost floor

The three report rows previously labelled Profile BOQ, Glass BOQ and Hardware BOQ are sections of one internal document. The system now combines them into **Internal BOQ & Cost Floor**:

- aluminium profile metres and stock-bar nesting
- selected system's exact source profile names, codes, 5800 mm stock references and listed values
- glass type, cut sizes, panel count and area
- hardware/accessory sets by opening type
- material and accessory subtotal
- fabrication labour and installation
- internal cost floor
- client net before tax
- negotiation headroom or shortfall and a visible floor status

The internal floor is project-level and is compared before customer taxes. A supervisor can enter the approved total from the project’s material costing sheet, such as the supplied Trialco example (`GHS 56,613.64`). If no approved total has been entered, the system uses a clearly labelled working estimate based on the current rate catalogue.

## 3. Evidence interpretation

The supplied Trialco costing image is an internal control sheet, not a customer quote. It lists profile, glass, accessory and consumable quantities/prices, then adds installation cost at 30% to arrive at a minimum internal project cost. It must not be sent to the client.

The supplied RGA Special Gardens quote is the reference for the customer layout: reference/date, client/site, job description, colour, opening rows, area-based rates, discount, GETF + NHIS, VAT and grand total.

## 4. Release control

The backend refuses to issue or accept a customer quote when the client net before tax is below the internal floor. This prevents a discount from silently taking a job below the supervisor-approved cost basis. The system still allows the design to be saved while it is under review.

The rates, source-profile-to-cut-role mapping and fabrication deductions marked as working/provisional in the application still require confirmation against Sofaamy's approved price list, system rules and final measurement before factory release.

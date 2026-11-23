import type {Customer} from '@carhire/types';
export const customerColumns = {
 id:'id',tenantId:'tenant_id',customerNumber:'customer_number',customerType:'customer_type',
 fullName:'full_name',email:'email',phone:'phone',idOrPassportNumber:'id_or_passport_number',
 taxPinNumber:'tax_pin_number',licenseNumber:'license_number',licenseExpiryDate:'license_expiry_date',
 nationality:'nationality',address:'address',city:'city',country:'country',status:'status',
 verificationStatus:'verification_status',corporateAccountId:'corporate_account_id',
 totalRentalsCount:'total_rentals_count',rating:'rating',emergencyContactName:'emergency_contact_name',
 emergencyContactPhone:'emergency_contact_phone',emergencyContactRelationship:'emergency_contact_relationship',
 notes:'notes',version:'version',createdAt:'created_at',updatedAt:'updated_at',
} satisfies Record<Exclude<keyof Customer,'tags'>,string>;

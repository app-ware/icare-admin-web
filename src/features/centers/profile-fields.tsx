'use client';
import { useId } from 'react';
import { profileSchema, type CenterProfile } from '@/domain/management';
export function readProfileForm(form: FormData, previous: CenterProfile): CenterProfile {
  const next = { ...previous };
  for (const key of [
    'name',
    'manager',
    'email',
    'mobile',
    'landline',
    'website',
    'address',
    'description',
  ] as const)
    if (form.has(key)) next[key] = String(form.get(key));
  if (form.has('latitude')) {
    const lat = String(form.get('latitude')).trim(),
      lng = String(form.get('longitude')).trim();
    if (!!lat != !!lng) throw new Error('Enter both latitude and longitude, or leave both blank.');
    next.location = lat ? { latitude: Number(lat), longitude: Number(lng) } : null;
  }
  const parsed = profileSchema.safeParse(next);
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join(' '));
  return parsed.data;
}
export function ProfileFields({
  profile,
  part = 'all',
}: {
  profile: CenterProfile;
  part?: 'all' | 'basics' | 'contact' | 'location';
}) {
  const id = useId();
  function input(
    name: Exclude<keyof CenterProfile, 'location' | 'description'>,
    label: string,
    type = 'text',
    max = 120,
    required = false,
  ) {
    return (
      <div className="field">
        <label htmlFor={`${id}-${name}`}>
          {label}
          {required && (
            <span className="required" aria-hidden="true">
              {' '}
              *
            </span>
          )}
        </label>
        <input
          id={`${id}-${name}`}
          name={name}
          type={type}
          defaultValue={profile[name]}
          maxLength={max}
          required={required}
          autoComplete="off"
        />
      </div>
    );
  }
  return (
    <div className="form-grid">
      {(part === 'all' || part === 'basics') && (
        <>
          {input('name', 'Center name', 'text', 160, true)}
          {input('manager', 'Manager name')}
          <div className="field full-width">
            <label htmlFor={`${id}-description`}>Description</label>
            <textarea
              id={`${id}-description`}
              name="description"
              defaultValue={profile.description}
              maxLength={2000}
              rows={3}
            />
          </div>
        </>
      )}
      {(part === 'all' || part === 'contact') && (
        <>
          {input('email', 'Contact email', 'email', 254)}
          {input('website', 'Website', 'url', 250)}
          {input('mobile', 'Mobile number', 'tel', 40)}
          {input('landline', 'Landline', 'tel', 40)}
          <div className="full-width">{input('address', 'Address', 'text', 400)}</div>
        </>
      )}
      {(part === 'all' || part === 'location') && (
        <>
          <div className="field">
            <label htmlFor={`${id}-latitude`}>Latitude</label>
            <input
              id={`${id}-latitude`}
              name="latitude"
              type="number"
              step="any"
              min={-90}
              max={90}
              defaultValue={profile.location?.latitude ?? ''}
            />
          </div>
          <div className="field">
            <label htmlFor={`${id}-longitude`}>Longitude</label>
            <input
              id={`${id}-longitude`}
              name="longitude"
              type="number"
              step="any"
              min={-180}
              max={180}
              defaultValue={profile.location?.longitude ?? ''}
            />
          </div>
          <p className="field-hint full-width">
            Use decimal coordinates. Leave both blank if a location is not available.
          </p>
        </>
      )}
    </div>
  );
}

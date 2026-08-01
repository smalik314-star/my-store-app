import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

const projectId = 'pharmaflow-rules-test';
let env: RulesTestEnvironment;

const product = (tenantId: string) => ({
  tenantId,
  name: 'Test Medicine',
  stockQuantity: 10,
  batches: [],
});

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: { rules: readFileSync(resolve('firestore.rules'), 'utf8') },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'tenants/tenant_a'), { id: 'tenant_a', ownerId: 'owner_a' });
    await setDoc(doc(db, 'tenants/tenant_b'), { id: 'tenant_b', ownerId: 'owner_b' });
    await setDoc(doc(db, 'users/owner_a'), {
      uid: 'owner_a', tenantId: 'tenant_a', role: 'owner', status: 'active',
    });
    await setDoc(doc(db, 'users/owner_b'), {
      uid: 'owner_b', tenantId: 'tenant_b', role: 'owner', status: 'active',
    });
  });
});

afterAll(async () => env.cleanup());

describe('catalogue product isolation', () => {
  it('allows an own-tenant missing catalogue product read followed by create', async () => {
    const db = env.authenticatedContext('owner_a').firestore();
    const ref = doc(db, 'products/tenant_a_catalog_request-1');
    await assertSucceeds(getDoc(ref));
    await assertSucceeds(setDoc(ref, product('tenant_a')));
  });

  it('denies a missing product read using another tenant prefix', async () => {
    const db = env.authenticatedContext('owner_a').firestore();
    await assertFails(getDoc(doc(db, 'products/tenant_b_catalog_request-1')));
  });

  it('denies cross-tenant product reads even for tenant-prefixed documents', async () => {
    await env.withSecurityRulesDisabled(async context => {
      await setDoc(doc(context.firestore(), 'products/tenant_b_catalog_existing'), product('tenant_b'));
    });
    const db = env.authenticatedContext('owner_a').firestore();
    await assertFails(getDoc(doc(db, 'products/tenant_b_catalog_existing')));
  });

  it('denies negative stock updates', async () => {
    await env.withSecurityRulesDisabled(async context => {
      await setDoc(doc(context.firestore(), 'products/tenant_a_existing'), product('tenant_a'));
    });
    const db = env.authenticatedContext('owner_a').firestore();
    await assertFails(updateDoc(doc(db, 'products/tenant_a_existing'), { stockQuantity: -1 }));
  });
});

describe('product usage counter', () => {
  it('allows a bounded multi-product purchase increment', async () => {
    await env.withSecurityRulesDisabled(async context => {
      await setDoc(doc(context.firestore(), 'productUsageCounters/tenant_a'), {
        tenantId: 'tenant_a', productsCount: 10,
      });
    });
    const db = env.authenticatedContext('owner_a').firestore();
    await assertSucceeds(updateDoc(doc(db, 'productUsageCounters/tenant_a'), {
      productsCount: 13, updatedAt: new Date(),
    }));
  });

  it('denies an unbounded counter jump', async () => {
    await env.withSecurityRulesDisabled(async context => {
      await setDoc(doc(context.firestore(), 'productUsageCounters/tenant_a'), {
        tenantId: 'tenant_a', productsCount: 10,
      });
    });
    const db = env.authenticatedContext('owner_a').firestore();
    await assertFails(updateDoc(doc(db, 'productUsageCounters/tenant_a'), {
      productsCount: 61, updatedAt: new Date(),
    }));
  });
});

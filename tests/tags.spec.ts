import { test, expect } from '@playwright/test';

const API = 'http://localhost:3456/api';

test.describe('Session Tags', () => {
  let sessionIds: string[] = [];

  test.beforeAll(async ({ request }) => {
    // Create 3 test sessions
    for (const name of ['alpha', 'beta', 'gamma']) {
      const res = await request.post(`${API}/sessions`, {
        data: { name, cwd: '/tmp', model: 'sonnet' },
      });
      const body = await res.json();
      sessionIds.push(body.id);
    }
  });

  test.afterAll(async ({ request }) => {
    // Clean up sessions
    for (const id of sessionIds) {
      await request.delete(`${API}/sessions/${id}`);
    }
    // Clean up tags
    const tagsRes = await request.get(`${API}/tags`);
    if (tagsRes.ok()) {
      const tags = await tagsRes.json();
      for (const tag of tags) {
        await request.delete(`${API}/tags/${tag.id}`);
      }
    }
  });

  test('app loads with sessions visible in sidebar', async ({ page }) => {
    await page.goto('/');
    const sidebar = page.locator('.w-72');
    await expect(page.getByRole('heading', { name: 'friendlist' })).toBeVisible();
    // Wait for sessions to load in sidebar
    await expect(sidebar.locator('text=alpha')).toBeVisible({ timeout: 5000 });
    await expect(sidebar.locator('text=beta')).toBeVisible();
    await expect(sidebar.locator('text=gamma')).toBeVisible();
  });

  test('tags API: create, list, assign, remove', async ({ request }) => {
    // Create a tag
    const createRes = await request.post(`${API}/tags`, {
      data: { name: 'frontend' },
    });
    expect(createRes.ok()).toBeTruthy();
    const tag = await createRes.json();
    expect(tag.name).toBe('frontend');
    expect(tag.color).toBeTruthy(); // auto-assigned color

    // List tags
    const listRes = await request.get(`${API}/tags`);
    const tags = await listRes.json();
    expect(tags.length).toBeGreaterThanOrEqual(1);

    // Assign tag to a session
    const assignRes = await request.post(`${API}/tags/${tag.id}/sessions/${sessionIds[0]}`, { data: {} });
    expect(assignRes.ok()).toBeTruthy();

    // Assign same tag to another session
    const assign2Res = await request.post(`${API}/tags/${tag.id}/sessions/${sessionIds[1]}`, { data: {} });
    expect(assign2Res.ok()).toBeTruthy();

    // Get session tags
    const sessionTagsRes = await request.get(`${API}/sessions/${sessionIds[0]}/tags`);
    expect(sessionTagsRes.ok()).toBeTruthy();
    const sessionTags = await sessionTagsRes.json();
    expect(sessionTags.length).toBe(1);
    expect(sessionTags[0].name).toBe('frontend');

    // Remove tag from session
    const removeRes = await request.delete(`${API}/tags/${tag.id}/sessions/${sessionIds[0]}`);
    expect(removeRes.ok()).toBeTruthy();

    // Verify removed
    const afterRemove = await request.get(`${API}/sessions/${sessionIds[0]}/tags`);
    const afterTags = await afterRemove.json();
    expect(afterTags.length).toBe(0);

    // Delete tag
    const deleteRes = await request.delete(`${API}/tags/${tag.id}`);
    expect(deleteRes.ok()).toBeTruthy();
  });

  test('right-click session shows context menu with tag options', async ({ page }) => {
    await page.goto('/');
    const sidebar = page.locator('.w-72');
    await expect(sidebar.locator('text=alpha')).toBeVisible({ timeout: 5000 });

    // Right-click a session in sidebar
    await sidebar.locator('text=alpha').click({ button: 'right' });

    // Context menu should appear with tag options
    await expect(page.locator('[data-testid="context-menu"]')).toBeVisible();
    await expect(page.locator('text=Add Tag')).toBeVisible();
  });

  test('create tag via context menu and see color in sidebar', async ({ page, request }) => {
    await page.goto('/');
    const sidebar = page.locator('.w-72');
    await expect(sidebar.locator('text=alpha')).toBeVisible({ timeout: 5000 });

    // Right-click → hover "Add Tag" to reveal submenu → click "+ New Tag..."
    await sidebar.locator('text=alpha').click({ button: 'right' });
    await expect(page.locator('[data-testid="context-menu"]')).toBeVisible();
    await page.locator('text=Add Tag').hover();
    await page.locator('text=+ New Tag...').click();

    // Should show tag creation input at bottom of sidebar
    const input = page.locator('[data-testid="new-tag-input"]');
    await expect(input).toBeVisible({ timeout: 3000 });
    await input.fill('backend');
    await input.press('Enter');

    // Wait for mutations + query refetch
    await page.waitForTimeout(2000);

    // Verify tag was created and assigned via API
    const tagsRes = await request.get(`${API}/tags`);
    const tags = await tagsRes.json();
    const backendTag = tags.find((t: { name: string }) => t.name === 'backend');
    expect(backendTag).toBeTruthy();

    const assignRes = await request.get(`${API}/tags/assignments`);
    const assigns = await assignRes.json();
    expect(assigns.length).toBeGreaterThanOrEqual(1);

    // Tag badge should appear in the sidebar (session is now in a tag group)
    await expect(page.locator('[data-testid="session-tag"]').first()).toBeVisible({ timeout: 15000 });
  });

  test('sessions with same tag are grouped and collapsible', async ({ page, request }) => {
    // Create a tag and assign to two sessions via API
    const tagRes = await request.post(`${API}/tags`, { data: { name: 'infra' } });
    const tag = await tagRes.json();
    await request.post(`${API}/tags/${tag.id}/sessions/${sessionIds[0]}`, { data: {} });
    await request.post(`${API}/tags/${tag.id}/sessions/${sessionIds[1]}`, { data: {} });

    await page.goto('/');
    await expect(page.getByText('alpha').first()).toBeVisible({ timeout: 5000 });

    // Should see a group header for 'infra'
    const groupHeader = page.locator('[data-testid="tag-group-header"]', { hasText: 'infra' });
    await expect(groupHeader).toBeVisible({ timeout: 3000 });

    // Both tagged sessions should be inside the group
    const group = page.locator('[data-testid="tag-group"][data-tag-name="infra"]');
    await expect(group.locator('text=alpha')).toBeVisible();
    await expect(group.locator('text=beta')).toBeVisible();

    // Click to collapse
    await groupHeader.click();

    // Sessions should be hidden
    await expect(group.locator('text=alpha')).toBeHidden();
    await expect(group.locator('text=beta')).toBeHidden();

    // Click again to expand
    await groupHeader.click();
    await expect(group.locator('text=alpha')).toBeVisible();

    // Clean up
    await request.delete(`${API}/tags/${tag.id}`);
  });
});

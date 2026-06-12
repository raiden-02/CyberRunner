import { BaseScreen } from "./BaseScreen.js";
import { api, type UserProfile } from "../../api/client.js";
import { THEME } from "../../theme.js";

const PRIMARY_WEAPONS = [
  { value: "AR_1", label: "Assault Rifle" },
  { value: "SMG_1", label: "SMG" },
  { value: "LMG_1", label: "LMG" },
  { value: "SHOTGUN_1", label: "Shotgun" },
  { value: "SNIPER_1", label: "Sniper Rifle" },
  { value: "ROCKET_1", label: "Rocket Launcher" },
  { value: "GL_1", label: "Grenade Launcher" },
];

const SECONDARY_WEAPONS = [
  { value: "PISTOL_1", label: "Pistol" },
  { value: "SMG_1", label: "SMG" },
  { value: "SHOTGUN_1", label: "Shotgun" },
];

export class ProfileScreen extends BaseScreen {
  private user: UserProfile | null = null;
  private onComplete: (user: UserProfile) => void = () => {};
  private nameInput!: HTMLInputElement;
  private primarySelect!: HTMLSelectElement;
  private secondarySelect!: HTMLSelectElement;
  private errorDiv!: HTMLDivElement;
  private saveBtn!: HTMLButtonElement;
  private titleEl!: HTMLHeadingElement;
  private isEditMode = false;

  constructor() {
    super("profile-screen");
    this.buildUI();
  }

  private buildUI(): void {
    const panel = this.createPanel();
    
    this.titleEl = this.createTitle("Create Profile");
    panel.appendChild(this.titleEl);

    panel.appendChild(this.createLabel("Display Name"));
    this.nameInput = this.createInput("Enter your name...");
    this.nameInput.maxLength = 20;
    panel.appendChild(this.nameInput);

    const loadoutTitle = document.createElement("div");
    loadoutTitle.textContent = "Loadout";
    loadoutTitle.style.cssText = `
      color: ${THEME.accent};
      font-size: 14px;
      font-weight: 600;
      margin: 16px 0 8px 0;
      text-transform: uppercase;
      letter-spacing: 1px;
    `;
    panel.appendChild(loadoutTitle);

    panel.appendChild(this.createLabel("Primary Weapon"));
    this.primarySelect = this.createSelect(PRIMARY_WEAPONS);
    panel.appendChild(this.primarySelect);

    panel.appendChild(this.createLabel("Secondary Weapon"));
    this.secondarySelect = this.createSelect(SECONDARY_WEAPONS);
    panel.appendChild(this.secondarySelect);

    this.errorDiv = this.createError();
    panel.appendChild(this.errorDiv);

    this.saveBtn = this.createButton("Save & Continue");
    this.saveBtn.onclick = () => this.handleSave();
    panel.appendChild(this.saveBtn);

    this.container.appendChild(panel);
  }

  setUser(user: UserProfile): void {
    this.user = user;
    this.nameInput.value = user.displayName || "";
    this.primarySelect.value = user.primaryWeaponId || "AR_1";
    this.secondarySelect.value = user.secondaryWeaponId || "PISTOL_1";
  }

  setOnComplete(callback: (user: UserProfile) => void): void {
    this.onComplete = callback;
  }

  setEditMode(isEdit: boolean): void {
    this.isEditMode = isEdit;
    this.titleEl.textContent = isEdit ? "Edit Profile" : "Create Profile";
    this.saveBtn.textContent = isEdit ? "Save Changes" : "Save & Continue";
  }

  protected override onShow(): void {
    this.errorDiv.textContent = "";
    this.nameInput.focus();
  }

  private async handleSave(): Promise<void> {
    const displayName = this.nameInput.value.trim();
    const primaryWeaponId = this.primarySelect.value;
    const secondaryWeaponId = this.secondarySelect.value;

    if (displayName.length < 2) {
      this.errorDiv.textContent = "Name must be at least 2 characters";
      return;
    }

    this.saveBtn.disabled = true;
    this.saveBtn.textContent = "Saving...";

    try {
      if (this.user?.id.startsWith("dev-user-") || this.user?.id.startsWith("guest-")) {
        const updated: UserProfile = {
          ...this.user,
          displayName,
          primaryWeaponId,
          secondaryWeaponId,
          profileComplete: true,
        };
        this.onComplete(updated);
        return;
      }

      const updated = await api.updateProfile({ displayName, primaryWeaponId, secondaryWeaponId });
      this.onComplete(updated);
    } catch (err: any) {
      this.errorDiv.textContent = err.message || "Failed to save profile";
    } finally {
      this.saveBtn.disabled = false;
      this.saveBtn.textContent = this.isEditMode ? "Save Changes" : "Save & Continue";
    }
  }
}

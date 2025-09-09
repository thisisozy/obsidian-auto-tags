import { App, Modal, Notice, Plugin, PluginSettingTab, Setting, TAbstractFile, TFile, TFolder, ToggleComponent } from 'obsidian';
import * as yaml from 'js-yaml';

interface PluginSettings {
	folders: Folder[]
}

interface FrontMatter {
	tags?: string[]
}

const DEFAULT_SETTINGS: Partial<PluginSettings> = {
	folders: []
}

export default class AutoTags extends Plugin {
	settings: PluginSettings;
	isVaultLoading: boolean;

	async onload() {
		await this.loadSettings();

		this.isVaultLoading = true;

		this.addSettingTab(new SettingTab(this.app, this, this.settings));

		this.registerEvent(
			this.app.vault.on("create", async (file) => {
				if (file instanceof TFile && !this.isVaultLoading) {
					await this.updateTagsOnFile(file, file.parent, "add");
				}
			})
		);

		this.registerEvent(
			this.app.vault.on("rename", async (file, oldPath) => {
				if (file instanceof TFile) {
					// Remove tags from moved file if folders have the automatic removal option turned on
					let oldFolderPath = oldPath.replace(file.name, '');
					if (oldFolderPath.endsWith('/')) oldFolderPath = oldFolderPath.slice(0, -1);

					const folder = this.app.vault.getFolderByPath(oldFolderPath);

					// remove old tags
					await this.updateTagsOnFile(file, folder, "remove");

					// add tags to moved file
					await this.updateTagsOnFile(file, file.parent, "add");

					// if a folder that has automatic tags gets renamed, the database gets updated respectively
				} else if (file instanceof TFolder) {
					const index = this.settings.folders.findIndex(folder => folder.path === oldPath);
					this.settings.folders[index].path = file.path;
					await this.saveSettings();
				}
			})
		)

		this.registerEvent(
			this.app.vault.on("delete", async (file) => {
				if (file instanceof TFolder) {
					const index = this.settings.folders.findIndex(folder => folder.path === file.path);
					this.settings.folders.splice(index, 1);
					await this.saveSettings();
				}
			})
		)

		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, folder) => {
				if (folder instanceof TFolder) {
					menu.addItem((item) => {
						item
							.setTitle("Automatic tags")
							.setIcon("tag")
							.onClick(async () => {
								new TagModal(this.app, this.settings, folder, async (tags, automaticRemoval, recursive) => {
									const index = this.settings.folders.findIndex(file => file.path === folder.path)
									const folderObj = new Folder(folder.path, tags, automaticRemoval, recursive);

									if (index != -1){
										if (this.settings.folders[index].recursive !== folderObj.recursive) {
											// if the recursiveness of the auto tags changed:
											if (folderObj.recursive) {
												await this.updateTagsOnAllFilesUnderAFolder(folder, folderObj.tags, true, "add");
											} else {
												folder.children.forEach(async (child) => {
													if (child instanceof TFolder) {
														await this.updateTagsOnAllFilesUnderAFolder(child, this.settings.folders[index].tags, true, "remove");
													}
												})
												const [ removedTags, _ ] = this.getArrayChanges(this.settings.folders[index].tags, folderObj.tags);
												await this.updateTagsOnAllFilesUnderAFolder(folder, removedTags, false, "remove");
											}
										} else {
											// if the recursiveness of the auto tags didn't change:
											const [ removedTags, addedTags ] = this.getArrayChanges(this.settings.folders[index].tags, folderObj.tags);

											this.app.vault.getAllLoadedFiles().forEach(async (file) => {
												if (file instanceof TFile) {
													if ((file.path.startsWith(folder.path) && folderObj.recursive) || file.path === `${folder.path}/${file.name}`) {
														for (let i in removedTags) {
															await this.removeTagFromFile(file, removedTags[i]);
														}
														for (let i in addedTags) {
															await this.addTagToFile(file, addedTags[i]);
														}
													}
												}
											})
										}
										
										this.settings.folders[index] = folderObj;
									} else {
										await this.updateTagsOnAllFilesUnderAFolder(folder, folderObj.tags, folderObj.recursive, "add");

										this.settings.folders.push(folderObj);
									}

									await this.saveSettings();
								}).open();
							})
					})
				}
			})
		);

		this.app.workspace.onLayoutReady(() => {
			this.isVaultLoading = false;
		})
	}

	async onunload() {
		await this.saveSettings();
	}

	async loadSettings(){
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(){
		await this.saveData(this.settings);
	}

	async refreshTagsOfAllFiles() {
		this.app.vault.getAllLoadedFiles().forEach(async (file) => {
			if (file instanceof TFile) {
				await this.updateTagsOnFile(file, file.parent, "remove");
				await this.updateTagsOnFile(file, file.parent, "add");
			}
		})
	}

	// adds or removes tags given by all folders above it
	async updateTagsOnFile(file: TFile, parent: TFolder | null, mode: "add" | "remove") {
		let firstIteration = true;

		while(parent && parent.path !== '/'){
				const index = this.settings.folders.findIndex(folder => folder.path === parent?.path);
				let folder : Folder;

				if (index != -1) {
					folder = this.settings.folders[index];

					if (firstIteration || folder.recursive) {
						for(let i in folder.tags){
							if (mode === "add"){
								await this.addTagToFile(file, folder.tags[i]);
							} else if (mode === "remove") {
								await this.removeTagFromFile(file, folder.tags[i]);
							}
						}
					}
				}
			
			firstIteration = false;
			parent = parent.parent;
		}
	}

	// adds or removes tags on all files under a folder
	async updateTagsOnAllFilesUnderAFolder(folder: TFolder, tags: string[], recursive: boolean, mode: "add" | "remove") {
		this.app.vault.getAllLoadedFiles().forEach(async (file) => {
			if (file instanceof TFile &&
				((file.path.startsWith(folder.path) && recursive) ||
				file.path === `${folder.path}/${file.name}`)) {
				for (let i in tags){
					if (mode === "add") {
						await this.addTagToFile(file, tags[i]);
					} else {
						await this.removeTagFromFile(file, tags[i]);
					}
				}
			}
		})
	}

	// add a tag to a file through a front matter object
	async addTagToFile(file: TFile, tag: string) {
		if(file.extension !== 'md') return;

		const content = await this.app.vault.read(file);
		let newContent: string;

		if(!content.startsWith("---")) {
			newContent = `---\ntags:\n  - ${tag}\n---\n${content}`;
		} else {
			let frontMatterObj = await this.getFMOFromFile(file);

			if(!frontMatterObj) return;

			if(!Array.isArray(frontMatterObj.tags)) frontMatterObj.tags = [];

			if(!frontMatterObj.tags.includes(tag)) {
				frontMatterObj.tags.push(tag);
			} else return;

			newContent = content.replace(/(?<=---\n)[\s\S]*?(?=\n---)/i, yaml.dump(frontMatterObj).trim());
			}

		await this.app.vault.modify(file, newContent);
	}

	// remove a tag from a file through a front matter object
	async removeTagFromFile(file: TFile, tag: string) {
		if(file.extension !== 'md') return;

		const content = await this.app.vault.read(file);
		let newContent: string;

		if (content.startsWith("---")) {
			let frontMatterObj = await this.getFMOFromFile(file);

			if(!frontMatterObj || !Array.isArray(frontMatterObj.tags)) return;

			const tagIndex = frontMatterObj.tags.indexOf(tag);
			if(tagIndex !== -1) {
				frontMatterObj.tags.splice(tagIndex, 1);
			} else return;
	
			newContent = content.replace(/(?<=---\n)[\s\S]*?(?=\n---)/i, yaml.dump(frontMatterObj).trim());
		} else return;

		await this.app.vault.modify(file, newContent);
	}

	// get front matter object from a file
	async getFMOFromFile(file: TFile) {
		const content = await this.app.vault.read(file);
		
		if (!content.startsWith("---")) return;

		const frontMatterMatch = content.match(/(?<=---\n)[\s\S]*?(?=\n---)/i);
		if(!frontMatterMatch) {
			console.error('No front matter found.');
			return;
		}

		let frontMatter = frontMatterMatch[0];

		let frontMatterObj : FrontMatter;
		try {
			frontMatterObj = yaml.load(frontMatter) as FrontMatter;
			if (typeof frontMatterObj !== 'object' || frontMatterObj === null) {
				throw new Error('Invalid front matter structure');
			}
			return frontMatterObj;
		} catch (e) {
			console.error("Error parsing YAML: ", e);
			return;
		}
	}

	// get changes in the form of 2 arrays from 2 arrays (removed items in an array and added items in the other)
	getArrayChanges(oldArr: string[], newArr: string[]): [string[], string[]] {
		//get all removed tags (contained in the old array but not in the new)
		let removedItems = [];
		for (var i in oldArr) {
			if (!newArr.contains(oldArr[i])) removedItems[removedItems.length] = oldArr[i];
		}

		//get all added tags (contained in the new array but not in the old)
		let addedItems = [];
		for (var i in newArr) {
			if (!oldArr.contains(newArr[i])) addedItems[addedItems.length] = newArr[i];
		}

		return [removedItems, addedItems];
	}
}

class Folder{
	path: string;
	tags: string[];
	recursive: boolean;
	automaticRemoval: boolean;

	constructor(path: string, tags: string[], automaticRemoval: boolean, recursive: boolean) {
		this.path = path;
		this.tags = tags;
		this.recursive = recursive;
		this.automaticRemoval = automaticRemoval;
	}
}

class TagModal extends Modal {
	index: number;
	text: string;
	tags: string[];
	automaticRemoval: boolean;
	recursive: boolean;
	settings: PluginSettings;
	file: TFolder;
	onSubmit: (tags: string[], automaticRemoval: boolean, recursive: boolean) => void;

	private automaticRemovalDefault: boolean;
	private recursiveDefault: boolean;
	private automaticRemovalToggle: ToggleComponent;
	private recursiveToggle: ToggleComponent;

	constructor(app: App, settings: PluginSettings, file: TFolder, onSubmit: (tags: string[], automaticRemoval: boolean, recursive: boolean) => void) {
		super(app);
		this.settings = settings;
		this.file = file;
		this.onSubmit = onSubmit;

		this.index = this.settings.folders.findIndex(folder => folder.path === this.file.path);

		this.text = this.index != -1 ? this.settings.folders[this.index].tags.join(', ') : '';
		this.automaticRemovalDefault = true;
		this.automaticRemoval = this.index != -1 ? this.settings.folders[this.index].automaticRemoval : this.automaticRemovalDefault;
		this.recursiveDefault = false;
		this.recursive = this.index != -1 ? this.settings.folders[this.index].recursive : this.recursiveDefault;
	}

	onOpen() {
		const {contentEl} = this;
		
		contentEl.createEl("h2", { text: "Add automatic tags to this folder" });

		new Setting(contentEl)
				.setName("Tag(s):")
				.addText((text) =>
					text
						.setValue(this.text)
						.setPlaceholder("tag1, tag2, tag3, ...")
						.onChange((value) => {
							this.text = value;
						})
					);

		new Setting(contentEl)
				.setName("Recursive tagging")
				.setDesc("Tags are applied to all nested files. (Files under any sub-folder)")
				.addToggle((recursive) => {
					this.recursiveToggle = recursive
						.setValue(this.recursive)
						.onChange((value) => {
							this.recursive = value;
						})
				})
				.addExtraButton((reset) => {
					reset
						.setIcon("rotate-ccw")
						.setTooltip("Reset to default")
						.onClick(() => {
							this.recursive = this.recursiveDefault;
							this.recursiveToggle.setValue(this.recursiveDefault);
						})
				})

		new Setting(contentEl)
				.setName("Automatic removal")
				.setDesc("Automatically remove the tags from files, once they get moved.")
				.addToggle((automaticRemoval) => {
					this.automaticRemovalToggle = automaticRemoval
						.setValue(this.automaticRemoval)
						.onChange((value) => {
							this.automaticRemoval = value;
						})
				})
				.addExtraButton((reset) => {
					reset
						.setIcon("rotate-ccw")
						.setTooltip("Reset to default")
						.onClick(() => {
							this.automaticRemoval = this.automaticRemovalDefault;
							this.automaticRemovalToggle.setValue(this.automaticRemovalDefault);
						})
				})

		new Setting(contentEl)
			.addButton((btn) => {
				btn
					.setButtonText("Submit")
					.setCta()
					.onClick(() => {
						this.close();

						this.tags = this.text.length > 0 ? this.text.replace(/\s+/g,'').split(',') : [];

						this.onSubmit(this.tags, this.automaticRemoval, this.recursive);
					})
			})
	}

	onClose() {
		this.contentEl.empty();
	}
}

class ConfirmationModal extends Modal {
	revertable: boolean;
	onSubmit: (b: boolean) => void;

	constructor(app: App, revertable: boolean, onSubmit: (b: boolean) => void){
		super(app);
		this.revertable = revertable;
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const warningDIV = this.contentEl.createDiv();
		warningDIV.addClass("confirmation-modal-warningDIV");

		warningDIV.createEl("h1", {text: "Are you sure?"});
		if (!this.revertable) warningDIV.createEl("p", {text: "You won't be able to revert these changes!"});
		else warningDIV.createEl("p", {text: " "});

		const buttonsDIV = this.contentEl.createDiv();
		buttonsDIV.addClass("confirmation-modal-buttonsDIV");

		new Setting(buttonsDIV)
			.addButton((btn) => {
				btn
					.setButtonText("Deny")
					.setCta()
					.setClass("confirmation-modal-button-deny")
					.onClick(() => {
						this.onSubmit(false);
						this.close();
					})
			})
			.addButton((btn) => {
				btn
					.setButtonText("Confirm")
					.setWarning()
					.setClass("confirmation-modal-button-confirm")
					.onClick(() => {
						this.onSubmit(true);
						this.close();
					})
			})
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}

class SettingTab extends PluginSettingTab {
	plugin: AutoTags;
	settings: PluginSettings;

	constructor(app: App, plugin: AutoTags, settings: PluginSettings) {
		super(app, plugin);
		this.settings = settings;
	}

	display(): void {
		let { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName("Refresh automatic tags")
			.setDesc("Refresh automatic tags on all files, in case of errors. Be cautious when doing this.")
			.addButton((btn) => {
				btn
					.setIcon("rotate-ccw")
					.setTooltip("Refresh automatic tags")
					.onClick(async () => {
						await this.plugin.refreshTagsOfAllFiles();
						new Notice("Automatic tags refreshed successfully.");
					})
			})

		new Setting(containerEl)
			.setName("Reset database")
			.addButton((btn) => {
				btn
					.setIcon("rotate-ccw")
					.setTooltip("Reset database")
					.setWarning()
					.onClick(async () => {
						new ConfirmationModal(this.app, false, (confirmation) => {
							if (confirmation) {
								this.settings.folders = [];
								this.plugin.saveSettings();
								new Notice("Database reset was ran successfully.");
							}
						}).open();
					})
			})
	}
}
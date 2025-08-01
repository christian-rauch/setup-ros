import * as core from "@actions/core";
import * as tc from "@actions/tool-cache";
import * as path from "path";

import * as chocolatey from "./package_manager/chocolatey";
import * as pip from "./package_manager/pip";
import * as utils from "./utils";

const binaryReleases: { [index: string]: string } = {
	humble:
		"https://github.com/ros2/ros2/releases/download/humble-20250331/ros2-humble-20250331-windows-release-amd64.zip",
	iron: "https://github.com/ros2/ros2/releases/download/release-iron-20241204/ros2-iron-20241204-windows-release-amd64.zip",
	jazzy:
		"https://github.com/ros2/ros2/releases/download/release-jazzy-20250430/ros2-jazzy-20250407-windows-release-amd64.zip",
	kilted:
		"https://github.com/ros2/ros2/releases/download/release-kilted-20250523/ros2-kilted-20250523-windows-release-amd64.zip",
};

const pip3Packages: string[] = ["lxml", "netifaces"];

/**
 * Install ROS 2 build tools.
 */
async function prepareRos2BuildEnvironment() {
	// Currently targeted Python version for Windows according to REP 2000
	const python_dir = tc.find("Python", "3.8");

	await utils.exec(
		path.join(python_dir, "python"),
		[
			"-c",
			"import sysconfig; print(sysconfig.get_config_var('BINDIR')); print(sysconfig.get_path('scripts'))",
		],
		{
			listeners: {
				stdline: (data: string) => {
					const p = data.trim();
					if (p) {
						core.info("Prepending to path: " + JSON.stringify(p));
						core.addPath(p);
					}
				},
			},
		},
	);

	core.addPath("c:\\program files\\cppcheck");
	await chocolatey.installChocoDependencies();
	await chocolatey.downloadAndInstallRos2NugetPackages();

	// Avoid version of pip that breaks Windows GitHub actions. See:
	// * https://github.com/ros-tooling/action-ros-ci/pull/719#issuecomment-1030318146
	// * https://github.com/actions/virtual-environments/issues/5027#issuecomment-1031113617
	await utils.exec("python", ["-m", "pip", "install", "-U", "pip!=22.0.*"], {
		cwd: path.sep,
	});

	await pip.installPython3Dependencies(false);
	await pip.runPython3PipInstall(pip3Packages, false);
	await pip.runPython3PipInstall(["rosdep", "vcstool"], false);
	return utils.exec(`rosdep`, ["init"]);
}

/**
 * Install ROS 2 binary releases.
 */
async function prepareRos2BinaryReleases() {
	for (const rosDistro of utils.getRequiredRosDistributions()) {
		if (rosDistro in binaryReleases) {
			await utils.exec("wget", [
				"--quiet",
				binaryReleases[rosDistro],
				"-O",
				`${rosDistro}.zip`,
			]);
			await utils.exec("7z", [
				"x",
				`${rosDistro}.zip`,
				"-y",
				`-oC:\\dev\\${rosDistro}`,
			]);
		}
	}
}

/**
 * Install build environment on a Windows worker.
 */
export async function runWindows() {
	await prepareRos2BuildEnvironment();
	return await prepareRos2BinaryReleases();
}

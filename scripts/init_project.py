#!/usr/bin/env python3
"""
Project scaffolding script for fullstack-project-generator.

Copies platform templates from assets/ to the output directory,
replaces {{ProjectName}} placeholders, and sets up the project structure.
"""

import argparse
import os
import re
import shutil
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SKILL_DIR = os.path.dirname(SCRIPT_DIR)
ASSETS_DIR = os.path.join(SKILL_DIR, "assets")

VALID_PLATFORMS = ["ios", "android", "web", "backend"]

TEMPLATE_DIRS = {
    "ios": "ios-template",
    "android": "android-template",
    "web": "web-template",
    "backend": "backend-template",
}


def to_camel_case(name: str) -> str:
    """Convert a name to CamelCase (e.g., 'my-app' -> 'MyApp')."""
    return "".join(word.capitalize() for word in re.split(r"[-_ ]+", name))


def to_kebab_case(name: str) -> str:
    """Convert a name to kebab-case (e.g., 'MyApp' -> 'my-app')."""
    s = re.sub(r"([A-Z])", r"-\1", name).lstrip("-").lower()
    return re.sub(r"[-_ ]+", "-", s)


def to_upper_snake(name: str) -> str:
    """Convert a name to UPPER_SNAKE_CASE (e.g., 'MyApp' -> 'MY_APP')."""
    return to_kebab_case(name).replace("-", "_").upper()


def replace_placeholders(content: str, project_name: str) -> str:
    """Replace all placeholder variants in content."""
    camel = to_camel_case(project_name)
    kebab = to_kebab_case(project_name)
    upper_snake = to_upper_snake(project_name)

    content = content.replace("{{ProjectName}}", camel)
    content = content.replace("{{project-name}}", kebab)
    content = content.replace("{{PROJECT_NAME}}", upper_snake)
    return content


def replace_in_filename(filename: str, project_name: str) -> str:
    """Replace placeholders in filenames."""
    camel = to_camel_case(project_name)
    return filename.replace("{{ProjectName}}", camel)


def copy_template(platform: str, project_name: str, output_dir: str) -> list[str]:
    """Copy a platform template to the output directory with placeholder replacement."""
    template_dir = os.path.join(ASSETS_DIR, TEMPLATE_DIRS[platform])
    target_dir = os.path.join(output_dir, platform)
    created_files = []

    if not os.path.exists(template_dir):
        print(f"  Warning: Template directory not found: {template_dir}", file=sys.stderr)
        return created_files

    for root, dirs, files in os.walk(template_dir):
        # Skip hidden directories
        dirs[:] = [d for d in dirs if not d.startswith(".")]

        rel_path = os.path.relpath(root, template_dir)
        target_root = os.path.join(target_dir, rel_path) if rel_path != "." else target_dir

        # Replace placeholders in directory names
        target_root = replace_placeholders(target_root, project_name)
        os.makedirs(target_root, exist_ok=True)

        for filename in files:
            if filename.startswith("."):
                continue

            src_file = os.path.join(root, filename)
            new_filename = replace_in_filename(filename, project_name)
            dst_file = os.path.join(target_root, new_filename)

            # Read and replace placeholders in file content
            try:
                with open(src_file, "r", encoding="utf-8") as f:
                    content = f.read()
                content = replace_placeholders(content, project_name)
                with open(dst_file, "w", encoding="utf-8") as f:
                    f.write(content)
            except UnicodeDecodeError:
                # Binary file, copy as-is
                shutil.copy2(src_file, dst_file)

            rel_created = os.path.relpath(dst_file, output_dir)
            created_files.append(rel_created)

    return created_files


def copy_docs_templates(project_name: str, output_dir: str) -> list[str]:
    """Copy documentation templates to docs/ directory."""
    docs_src = os.path.join(ASSETS_DIR, "docs-templates")
    docs_dst = os.path.join(output_dir, "docs")
    created_files = []

    if not os.path.exists(docs_src):
        return created_files

    os.makedirs(docs_dst, exist_ok=True)

    for filename in os.listdir(docs_src):
        if filename.startswith("."):
            continue
        src = os.path.join(docs_src, filename)
        if not os.path.isfile(src):
            continue

        # Remove '-template' suffix from filename
        new_name = filename.replace("-template", "")
        dst = os.path.join(docs_dst, new_name)

        with open(src, "r", encoding="utf-8") as f:
            content = f.read()
        content = replace_placeholders(content, project_name)
        with open(dst, "w", encoding="utf-8") as f:
            f.write(content)

        created_files.append(os.path.relpath(dst, output_dir))

    return created_files


def copy_docker(project_name: str, output_dir: str) -> list[str]:
    """Copy Docker configuration files."""
    docker_src = os.path.join(ASSETS_DIR, "docker")
    docker_dst = os.path.join(output_dir, "docker")
    created_files = []

    if not os.path.exists(docker_src):
        return created_files

    os.makedirs(docker_dst, exist_ok=True)

    for filename in os.listdir(docker_src):
        if filename.startswith("."):
            continue
        src = os.path.join(docker_src, filename)
        if not os.path.isfile(src):
            continue

        dst = os.path.join(docker_dst, filename)
        with open(src, "r", encoding="utf-8") as f:
            content = f.read()
        content = replace_placeholders(content, project_name)
        with open(dst, "w", encoding="utf-8") as f:
            f.write(content)

        created_files.append(os.path.relpath(dst, output_dir))

    return created_files


def main():
    parser = argparse.ArgumentParser(
        description="Initialize a fullstack project from templates.",
        epilog="Example: %(prog)s --name MyBookStore --platforms ios backend --output-dir ./projects/bookstore",
    )
    parser.add_argument(
        "--name",
        required=True,
        help="Project name (e.g., MyBookStore, online-shop). Will be converted to appropriate casing.",
    )
    parser.add_argument(
        "--platforms",
        nargs="+",
        choices=VALID_PLATFORMS,
        required=True,
        help="Target platforms to scaffold.",
    )
    parser.add_argument(
        "--output-dir",
        required=True,
        help="Output directory for the generated project.",
    )

    args = parser.parse_args()

    output_dir = os.path.abspath(args.output_dir)
    if os.path.exists(output_dir) and os.listdir(output_dir):
        print(f"Error: Output directory '{output_dir}' is not empty.", file=sys.stderr)
        sys.exit(1)

    os.makedirs(output_dir, exist_ok=True)

    all_created = []
    camel_name = to_camel_case(args.name)

    print(f"Initializing project: {camel_name}")
    print(f"Platforms: {', '.join(args.platforms)}")
    print(f"Output: {output_dir}")
    print()

    # Copy platform templates
    for platform in args.platforms:
        print(f"Setting up {platform}...")
        files = copy_template(platform, args.name, output_dir)
        all_created.extend(files)
        print(f"  Created {len(files)} files")

    # Copy documentation templates
    print("Setting up docs...")
    doc_files = copy_docs_templates(args.name, output_dir)
    all_created.extend(doc_files)
    print(f"  Created {len(doc_files)} files")

    # Copy Docker configuration
    print("Setting up docker...")
    docker_files = copy_docker(args.name, output_dir)
    all_created.extend(docker_files)
    print(f"  Created {len(docker_files)} files")

    # Summary
    print()
    print(f"Project '{camel_name}' initialized successfully!")
    print(f"Total files created: {len(all_created)}")
    print()
    print("Created files:")
    for f in sorted(all_created):
        print(f"  {f}")


if __name__ == "__main__":
    main()

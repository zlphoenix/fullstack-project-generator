#!/usr/bin/env python3
"""
OpenAPI contract skeleton generator.

Reads a PRD (Product Requirements Document) and generates
an OpenAPI 3.0 YAML skeleton with placeholder paths and schemas.
"""

import argparse
import os
import re
import sys


OPENAPI_HEADER = """openapi: 3.0.3
info:
  title: "{project_name} API"
  version: "1.0.0"
  description: |
    API documentation for {project_name}.
    Generated from PRD. Fill in the endpoint details based on your requirements.

servers:
  - url: http://localhost:8080/api/v1
    description: Local development server

paths:
{paths}
components:
  schemas:
    ApiResponse:
      type: object
      properties:
        code:
          type: integer
          example: 200
        message:
          type: string
          example: "success"
        data:
          type: object

    PaginatedResponse:
      type: object
      properties:
        code:
          type: integer
        message:
          type: string
        data:
          type: object
          properties:
            content:
              type: array
              items:
                type: object
            totalElements:
              type: integer
            totalPages:
              type: integer
            page:
              type: integer
            size:
              type: integer

{schemas}
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT

security:
  - bearerAuth: []
"""

PATH_TEMPLATE = """  /{resource}:
    get:
      summary: "List {resource}"
      tags:
        - {tag}
      parameters:
        - name: page
          in: query
          schema:
            type: integer
            default: 0
        - name: size
          in: query
          schema:
            type: integer
            default: 20
      responses:
        "200":
          description: Success
    post:
      summary: "Create {singular}"
      tags:
        - {tag}
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/{schema}"
      responses:
        "201":
          description: Created

  /{resource}/{{id}}:
    get:
      summary: "Get {singular} by ID"
      tags:
        - {tag}
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: integer
      responses:
        "200":
          description: Success
    put:
      summary: "Update {singular}"
      tags:
        - {tag}
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: integer
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/{schema}"
      responses:
        "200":
          description: Updated
    delete:
      summary: "Delete {singular}"
      tags:
        - {tag}
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: integer
      responses:
        "204":
          description: Deleted
"""

SCHEMA_TEMPLATE = """    {name}:
      type: object
      properties:
        id:
          type: integer
          readOnly: true
        # TODO: Add properties based on PRD requirements
        createdAt:
          type: string
          format: date-time
          readOnly: true
        updatedAt:
          type: string
          format: date-time
          readOnly: true
"""


def extract_potential_resources(prd_content: str) -> list[str]:
    """Extract potential API resource names from PRD content using heuristics."""
    # Look for common patterns that suggest entities/resources
    resources = set()

    # Pattern: words that appear after management/management of, CRUD keywords
    patterns = [
        r"(?:manage|management of|crud for)\s+(\w+)",
        r"(\w+)\s+(?:management|module|service|feature)",
        r"(?:create|add|delete|update|list|view)\s+(\w+)",
    ]

    for pattern in patterns:
        matches = re.findall(pattern, prd_content.lower())
        for match in matches:
            word = match.strip()
            if len(word) > 2 and word not in (
                "the", "and", "for", "with", "this", "that", "from",
                "data", "system", "user", "page", "feature", "function",
            ):
                resources.add(word)

    # Default resources if none found
    if not resources:
        resources = {"users", "items"}

    return sorted(resources)


def singularize(word: str) -> str:
    """Simple singularization."""
    if word.endswith("ies"):
        return word[:-3] + "y"
    if word.endswith("ses") or word.endswith("xes"):
        return word[:-2]
    if word.endswith("s") and not word.endswith("ss"):
        return word[:-1]
    return word


def pluralize(word: str) -> str:
    """Simple pluralization."""
    if word.endswith("y") and word[-2] not in "aeiou":
        return word[:-1] + "ies"
    if word.endswith(("s", "x", "sh", "ch")):
        return word + "es"
    return word + "s"


def to_pascal(word: str) -> str:
    """Convert to PascalCase."""
    return word[0].upper() + word[1:]


def generate_openapi(project_name: str, resources: list[str]) -> str:
    """Generate OpenAPI YAML content."""
    paths_str = ""
    schemas_str = ""

    for resource in resources:
        plural = pluralize(resource) if not resource.endswith("s") else resource
        singular = singularize(resource) if resource.endswith("s") else resource
        schema_name = to_pascal(singular)
        tag = to_pascal(singular)

        paths_str += PATH_TEMPLATE.format(
            resource=plural,
            singular=singular,
            tag=tag,
            schema=schema_name,
        )

        schemas_str += SCHEMA_TEMPLATE.format(name=schema_name)

    return OPENAPI_HEADER.format(
        project_name=project_name,
        paths=paths_str if paths_str else "  # TODO: Define API paths\n  {}:\n",
        schemas=schemas_str,
    )


def main():
    parser = argparse.ArgumentParser(
        description="Generate an OpenAPI 3.0 YAML skeleton from a PRD document.",
        epilog="Example: %(prog)s --prd docs/PRD.md --output api/openapi.yaml --name MyBookStore",
    )
    parser.add_argument(
        "--prd",
        required=True,
        help="Path to the PRD markdown file.",
    )
    parser.add_argument(
        "--output",
        default="api/openapi.yaml",
        help="Output path for the generated OpenAPI YAML (default: api/openapi.yaml).",
    )
    parser.add_argument(
        "--name",
        default="MyProject",
        help="Project name for the API title (default: MyProject).",
    )

    args = parser.parse_args()

    if not os.path.exists(args.prd):
        print(f"Error: PRD file not found: {args.prd}", file=sys.stderr)
        sys.exit(1)

    with open(args.prd, "r", encoding="utf-8") as f:
        prd_content = f.read()

    resources = extract_potential_resources(prd_content)
    print(f"Detected potential resources: {', '.join(resources)}")

    openapi_content = generate_openapi(args.name, resources)

    output_dir = os.path.dirname(args.output)
    if output_dir:
        os.makedirs(output_dir, exist_ok=True)

    with open(args.output, "w", encoding="utf-8") as f:
        f.write(openapi_content)

    print(f"OpenAPI skeleton generated: {args.output}")
    print()
    print("Next steps:")
    print("  1. Review the generated paths and schemas")
    print("  2. Add specific properties to each schema based on PRD requirements")
    print("  3. Add request/response examples")
    print("  4. Add authentication requirements per endpoint")


if __name__ == "__main__":
    main()

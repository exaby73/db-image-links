use crate::dropbox::SkuResult;

pub fn build_csv(rows: &[SkuResult]) -> String {
    let max_links = rows.iter().map(|row| row.links.len()).max().unwrap_or(0);
    let mut output = String::new();

    let mut header = vec!["SKU".to_string()];
    for index in 1..=max_links {
        header.push(format!("Link {index}"));
    }
    write_row(&mut output, &header);

    for row in rows {
        let mut cells = vec![row.sku.clone()];
        cells.extend(row.links.iter().cloned());
        while cells.len() < max_links + 1 {
            cells.push(String::new());
        }
        write_row(&mut output, &cells);
    }

    output
}

fn write_row(output: &mut String, cells: &[String]) {
    for (index, cell) in cells.iter().enumerate() {
        if index > 0 {
            output.push(',');
        }
        output.push_str(&escape_cell(cell));
    }
    output.push('\n');
}

fn escape_cell(cell: &str) -> String {
    if cell.contains([',', '"', '\n', '\r']) {
        format!("\"{}\"", cell.replace('"', "\"\""))
    } else {
        cell.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn expands_columns_to_largest_link_count() {
        let rows = vec![
            SkuResult {
                sku: "1077S-BEIGE".to_string(),
                links: vec!["one".to_string(), "two".to_string()],
                image_count: 2,
            },
            SkuResult {
                sku: "1078S-BLACK".to_string(),
                links: vec!["three".to_string()],
                image_count: 1,
            },
        ];

        assert_eq!(
            build_csv(&rows),
            "SKU,Link 1,Link 2\n1077S-BEIGE,one,two\n1078S-BLACK,three,\n"
        );
    }

    #[test]
    fn escapes_csv_cells() {
        let rows = vec![SkuResult {
            sku: "SKU,\"quoted\"".to_string(),
            links: vec!["https://example.com/a,b".to_string()],
            image_count: 1,
        }];

        assert_eq!(
            build_csv(&rows),
            "SKU,Link 1\n\"SKU,\"\"quoted\"\"\",\"https://example.com/a,b\"\n"
        );
    }
}

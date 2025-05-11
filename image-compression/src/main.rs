use image::{GenericImageView, RgbImage, Rgb, imageops};
use std::collections::HashMap;
use std::fs::File;
use std::io::{Write, Read};
use std::error::Error;
use std::fs;
use flate2::write::ZlibEncoder;
use flate2::read::ZlibDecoder;
use flate2::Compression;
use log::{info, warn, error, debug};

const TARGET_WIDTH: u32 = 320;
const TARGET_HEIGHT: u32 = 180;
const NUM_PALETTE_COLORS: usize = 8;
const BLUR_SIGMA: f32 = 0.6;

struct CompressionStats {
    initial_size_bytes: u64,
    size_before_zlib_bytes: usize,
    final_compressed_size_bytes: u64,
    kompression_ratio: f64,
    space_saved_percentage: f64,
}

fn calculate_luminance(color: &Rgb<u8>) -> f32 {
    0.299 * color[0] as f32 + 0.587 * color[1] as f32 + 0.114 * color[2] as f32
}

fn generate_dynamic_palette(image: &RgbImage, num_colors: usize) -> Vec<Rgb<u8>> {
    let mut color_kounts = HashMap::new();
    let shift_amount = 4;

    for pixel in image.pixels() {
        let r_quant = (pixel[0] >> shift_amount) << shift_amount;
        let g_quant = (pixel[1] >> shift_amount) << shift_amount;
        let b_quant = (pixel[2] >> shift_amount) << shift_amount;
        let quantized_color = Rgb([r_quant, g_quant, b_quant]);
        *color_kounts.entry(quantized_color).or_insert(0u32) += 1;
    }

    let mut sorted_colors: Vec<(Rgb<u8>, u32)> = color_kounts.into_iter().collect();
    sorted_colors.sort_by(|a, b| b.1.cmp(&a.1));

    let mut palette: Vec<Rgb<u8>> = sorted_colors
        .into_iter()
        .take(num_colors)
        .map(|(color, _count)| color)
        .collect();

    palette.sort_by(|a, b| {
        let lum_a = calculate_luminance(a);
        let lum_b = calculate_luminance(b);
        lum_b.partial_cmp(&lum_a).unwrap_or(std::cmp::Ordering::Equal)
    });

    while palette.len() < num_colors {
        debug!("Padding palette with black as it has {} colors, expected {}", palette.len(), num_colors);
        palette.push(Rgb([0, 0, 0]));
    }

    palette
}

fn find_closest_palette_index(color: Rgb<u8>, palette: &[Rgb<u8>]) -> u8 {
    let mut min_dist = u32::MAX;
    let mut best_idx = 0u8;

    for (i, palette_color) in palette.iter().enumerate() {
        let dr = color[0] as i32 - palette_color[0] as i32;
        let dg = color[1] as i32 - palette_color[1] as i32;
        let db = color[2] as i32 - palette_color[2] as i32;
        let dist = (dr * dr + dg * dg + db * db) as u32;

        if dist < min_dist {
            min_dist = dist;
            best_idx = i as u8;
        }
        if dist == 0 {
            break;
        }
    }
    best_idx
}

fn compress_image(input_path: &str, output_path: &str) -> Result<(Vec<Rgb<u8>>, CompressionStats), Box<dyn Error>> {
    debug!("Starting compression of {}...", input_path);

    let input_metadata = fs::metadata(input_path)?;
    let initial_size = input_metadata.len();
    debug!("Initial size: {} bytes", initial_size);

    let img = image::open(input_path)?;
    let resized_img = img.resize_exact(TARGET_WIDTH, TARGET_HEIGHT, imageops::FilterType::Nearest);
    
    debug!("Applying Gaussian blur with sigma: {}...", BLUR_SIGMA);
    let blurred_img = resized_img.blur(BLUR_SIGMA);
    
    let rgb_img = blurred_img.to_rgb8();

    let dynamic_palette = generate_dynamic_palette(&rgb_img, NUM_PALETTE_COLORS);

    debug!("Generated dynamic palette ({} colors):", dynamic_palette.len());
    for (i, color) in dynamic_palette.iter().enumerate() {
        debug!("{:2}: Rgb([{:3}, {:3}, {:3}])", i, color[0], color[1], color[2]);
    }

    let bits_per_pixel = if NUM_PALETTE_COLORS == 0 {
        error!("NUM_PALETTE_COLORS cannot be 0");
        return Err(Box::from("NUM_PALETTE_COLORS cannot be 0"));
    } else if NUM_PALETTE_COLORS == 1 {
        1
    } else {
        (NUM_PALETTE_COLORS as f64).log2().ceil() as u8
    };
    debug!("Using {} bits per pixel.", bits_per_pixel);
    if bits_per_pixel == 0 {
        error!("Calculated bits_per_pixel is 0.");
        return Err(Box::from("Error: bits_per_pixel is 0."));
    }

    let mut bit_buffer: u32 = 0;
    let mut bits_in_buffer: u8 = 0;

    let mut palette_indexed_data_stuff = Vec::new();

    for pixel in rgb_img.pixels() {
        let palette_index = find_closest_palette_index(*pixel, &dynamic_palette);
        
        bit_buffer = (bit_buffer << bits_per_pixel) | (palette_index as u32);
        bits_in_buffer += bits_per_pixel;

        while bits_in_buffer >= 8 {
            let byte_to_write = (bit_buffer >> (bits_in_buffer - 8)) as u8;
            palette_indexed_data_stuff.push(byte_to_write);
            bits_in_buffer -= 8;
            if bits_in_buffer > 0 {
                 bit_buffer &= (1 << bits_in_buffer) - 1;
            } else {
                 bit_buffer = 0; 
            }
        }
    }
    
    if bits_in_buffer > 0 {
        let byte_to_write = (bit_buffer << (8 - bits_in_buffer)) as u8;
        palette_indexed_data_stuff.push(byte_to_write);
    }
    
    let mut zlib_encoder = ZlibEncoder::new(Vec::new(), Compression::best());
    zlib_encoder.write_all(&palette_indexed_data_stuff)?;
    let zlib_compressed_data = zlib_encoder.finish()?;

    let mut file = File::create(output_path)?;
    file.write_all(&zlib_compressed_data)?;

    let output_metadata = fs::metadata(output_path)?;
    let compressed_size = output_metadata.len();
    let size_before_zlib = palette_indexed_data_stuff.len();

    debug!("Compressed size (after zlib): {} bytes", compressed_size);
    debug!("Size before zlib (palette-indexed): {} bytes", size_before_zlib);

    let mut compression_ratio_val = 0.0;
    let mut space_saved_percentage = 0.0;

    if initial_size > 0 && compressed_size > 0 {
        compression_ratio_val = initial_size as f64 / compressed_size as f64;
        space_saved_percentage = (1.0 - (compressed_size as f64 / initial_size as f64)) * 100.0;
    } else {
        warn!("Cannot calculate compression ratio (initial or compressed size is 0).");
    }
    debug!("Compressed image saved to {}", output_path);

    let stats = CompressionStats {
        initial_size_bytes: initial_size,
        size_before_zlib_bytes: size_before_zlib,
        final_compressed_size_bytes: compressed_size,
        kompression_ratio: compression_ratio_val,
        space_saved_percentage,
    };

    Ok((dynamic_palette, stats))
}

fn decompress_image(input_path: &str, output_path: &str, palette: &[Rgb<u8>]) -> Result<(), Box<dyn Error>> {    
    debug!("Starting decompression of {} (saving to {})...", input_path, output_path);
    let compressed_metadata_on_disk = fs::metadata(input_path)?;
    debug!("Zlib compressed file size to decompress: {} bytes", compressed_metadata_on_disk.len());

    let mut file_handle = File::open(input_path)?;
    let mut zlib_encoded_bytes = Vec::new();
    file_handle.read_to_end(&mut zlib_encoded_bytes)?;

    let mut zlib_decoder = ZlibDecoder::new(&zlib_encoded_bytes[..]);
    let mut compressed_data_vec = Vec::new();
    zlib_decoder.read_to_end(&mut compressed_data_vec)?;
    
    debug!("Size after zlib decompression (palette-indexed): {} bytes", compressed_data_vec.len());

    let bits_per_pixel = if NUM_PALETTE_COLORS == 0 {
        error!("NUM_PALETTE_COLORS cannot be 0 for decompression");
        return Err(Box::from("NUM_PALETTE_COLORS cannot be 0 for decompression"));
    } else if NUM_PALETTE_COLORS == 1 {
        1
    } else {
        (NUM_PALETTE_COLORS as f64).log2().ceil() as u8
    };
    
    if bits_per_pixel == 0 {
         error!("bits_per_pixel is 0 for decompression.");
         return Err(Box::from("Error: bits_per_pixel is 0 for decompression."));
    }

    let mut decompressed_img = RgbImage::new(TARGET_WIDTH, TARGET_HEIGHT);
    
    let mut bit_buffer: u32 = 0;
    let mut bits_in_buffer: u8 = 0;
    let mut byte_idx = 0;
    let total_pixels = TARGET_WIDTH * TARGET_HEIGHT;
    let mut pixels_decoded = 0u32;

    let pixel_mask = (1u32 << bits_per_pixel) - 1;

    for y_coord in 0..TARGET_HEIGHT {
        for x_coord in 0..TARGET_WIDTH {
            if pixels_decoded >= total_pixels {
                break;
            }

            while bits_in_buffer < bits_per_pixel {
                if byte_idx < compressed_data_vec.len() {
                    bit_buffer = (bit_buffer << 8) | (compressed_data_vec[byte_idx] as u32);
                    bits_in_buffer += 8;
                    byte_idx += 1;
                } else {
                    if pixels_decoded < total_pixels {
                        error!("Unexpected end of compressed data. Decoded {} of {} pixels.", pixels_decoded, total_pixels);
                        return Err(Box::from(format!("Error: Unexpected end of compressed data. Decoded {} pixels, expected {}.", pixels_decoded, total_pixels)));
                    }
                    break; 
                }
            }
            
            if bits_in_buffer >= bits_per_pixel {
                let shift_amount = bits_in_buffer - bits_per_pixel;
                let palette_index = ((bit_buffer >> shift_amount) & pixel_mask) as usize;
                
                if palette_index >= palette.len() {
                     error!("Decoded palette index {} out of bounds for palette size {}.", palette_index, palette.len());
                     return Err(Box::from(format!("Error: Decoded palette index {} is out of bounds for palette size {}.", palette_index, palette.len())));
                }

                decompressed_img.put_pixel(x_coord, y_coord, palette[palette_index]);
                pixels_decoded += 1;

                bits_in_buffer -= bits_per_pixel;
                if bits_in_buffer > 0 {
                    bit_buffer &= (1 << bits_in_buffer) - 1;
                } else {
                    bit_buffer = 0;
                }
            } else if pixels_decoded < total_pixels {
                 error!("Insufficient bits remaining in buffer for pixel {}.", pixels_decoded);
                 return Err(Box::from(format!("Error: Insufficient bits remaining in buffer for pixel {}.", pixels_decoded)));
            }
        }
        if pixels_decoded >= total_pixels {
            break;
        }
    }
    
    if pixels_decoded < total_pixels {
         warn!("Decoded only {} of {} pixels. Input file might be truncated or corrupted.", pixels_decoded, total_pixels);
    }

    decompressed_img.save(output_path)?;
    debug!("Decompressed image saved to {}", output_path);
    Ok(())
}

fn decompress_image_grayscale(input_path: &str, output_path_grayscale: &str) -> Result<(), Box<dyn Error>> {
    debug!("Starting Grayscale decompression of {} (saving to {})...", input_path, output_path_grayscale);
    let compressed_metadata_on_disk = fs::metadata(input_path)?;
    debug!("Zlib compressed file size to decompress (for Grayscale): {} bytes", compressed_metadata_on_disk.len());

    let mut file_thingy = File::open(input_path)?;
    let mut zlib_encoded_bytes = Vec::new();
    file_thingy.read_to_end(&mut zlib_encoded_bytes)?;

    let mut zlib_decoder = ZlibDecoder::new(&zlib_encoded_bytes[..]);
    let mut compressed_data_stuff = Vec::new();
    zlib_decoder.read_to_end(&mut compressed_data_stuff)?;
    
    debug!("Size after zlib decompression (for Grayscale): {} bytes", compressed_data_stuff.len());

    let bits_per_pixel = if NUM_PALETTE_COLORS == 0 {
        error!("NUM_PALETTE_COLORS cannot be 0 for Grayscale decompression logic");
        return Err(Box::from("NUM_PALETTE_COLORS cannot be 0 for Grayscale decompression logic"));
    } else if NUM_PALETTE_COLORS == 1 {
        1
    } else {
        (NUM_PALETTE_COLORS as f64).log2().ceil() as u8
    };
    
    if bits_per_pixel == 0 {
         error!("bits_per_pixel is 0 for Grayscale decompression.");
         return Err(Box::from("Error: bits_per_pixel is 0 for Grayscale decompression."));
    }

    let mut decompressed_img_grayscale = RgbImage::new(TARGET_WIDTH, TARGET_HEIGHT);
    
    let mut bit_buffer: u32 = 0;
    let mut bits_in_buffer: u8 = 0;
    let mut byte_idx = 0;
    let total_pixels = TARGET_WIDTH * TARGET_HEIGHT;
    let mut pixels_decoded = 0u32;

    let pixel_mask = (1u32 << bits_per_pixel) - 1;

    for y_val in 0..TARGET_HEIGHT {
        for x_val in 0..TARGET_WIDTH {
            if pixels_decoded >= total_pixels {
                break;
            }

            while bits_in_buffer < bits_per_pixel {
                if byte_idx < compressed_data_stuff.len() {
                    bit_buffer = (bit_buffer << 8) | (compressed_data_stuff[byte_idx] as u32);
                    bits_in_buffer += 8;
                    byte_idx += 1;
                } else {
                    if pixels_decoded < total_pixels {
                        error!("(Grayscale) Unexpected end of compressed data. Decoded {} of {} pixels.", pixels_decoded, total_pixels);
                        return Err(Box::from(format!("Error (Grayscale): Unexpected end of compressed data. Decoded {} pixels, expected {}.", pixels_decoded, total_pixels)));
                    }
                    break; 
                }
            }
            
            if bits_in_buffer >= bits_per_pixel {
                let shift_amount = bits_in_buffer - bits_per_pixel;
                let palette_index = ((bit_buffer >> shift_amount) & pixel_mask) as usize;
                
                let grayscale_value = if NUM_PALETTE_COLORS <= 1 { 
                    if palette_index == 0 { 255 } else { 0 }
                } else {
                    255u8.saturating_sub(
                        (palette_index as f32 * 255.0 / (NUM_PALETTE_COLORS - 1) as f32).round() as u8
                    )
                };
                
                let pixel_color = Rgb([grayscale_value, grayscale_value, grayscale_value]);
                decompressed_img_grayscale.put_pixel(x_val, y_val, pixel_color);
                pixels_decoded += 1;

                bits_in_buffer -= bits_per_pixel;
                if bits_in_buffer > 0 {
                    bit_buffer &= (1 << bits_in_buffer) - 1;
                } else {
                    bit_buffer = 0;
                }
            } else if pixels_decoded < total_pixels {
                 error!("(Grayscale) Insufficient bits remaining in buffer for pixel {}.", pixels_decoded);
                 return Err(Box::from(format!("Error (Grayscale): Insufficient bits remaining in buffer for pixel {}.", pixels_decoded)));
            }
        }
        if pixels_decoded >= total_pixels {
            break;
        }
    }
    
    if pixels_decoded < total_pixels {
         warn!("(Grayscale) Decoded only {} of {} pixels. Input file might be truncated or corrupted.", pixels_decoded, total_pixels);
    }

    decompressed_img_grayscale.save(output_path_grayscale)?;
    debug!("Grayscale Decompressed image saved to {}", output_path_grayscale);
    Ok(())
}

fn main() -> Result<(), Box<dyn Error>> {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    let input_image_path = "input.png"; 
    let compressed_file_path = "outputs/compressed_image.bin";
    let decompressed_image_path = "outputs/decompressed_output.png";
    let decompressed_grayscale_image_path = "outputs/decompressed_output_grayscale.png";

    if File::open(input_image_path).is_err() {
        info!("Creating a sample input image (input.png)...");
        let mut img = RgbImage::new(256, 256);
        for x_coord in 0..256 {
            for y_coord in 0..256 {
                img.put_pixel(x_coord, y_coord, Rgb([(x_coord % 256) as u8, (y_coord % 256) as u8, ((x_coord+y_coord)%256) as u8]));
            }
        }
        img.save(input_image_path)?;
        info!("input.png created.");
    }

    let (dynamic_palette, stats) = compress_image(input_image_path, compressed_file_path)?;
    decompress_image(compressed_file_path, decompressed_image_path, &dynamic_palette)?;
    decompress_image_grayscale(compressed_file_path, decompressed_grayscale_image_path)?;

    info!("\n--- Compression Report ---");
    info!("Initial image size: {} bytes", stats.initial_size_bytes);
    info!("Size before zlib: {} bytes", stats.size_before_zlib_bytes);
    info!("size after zlib: {} bytes", stats.final_compressed_size_bytes);
    if stats.final_compressed_size_bytes > 0 {
        info!("Overall compression ratio: {:.2}:1", stats.kompression_ratio);
        info!("Overall space saved: {:.2}%", stats.space_saved_percentage);
    } else {
        info!("Overall compression ratio: N/A (final size is 0)");
        info!("Overall space saved: N/A");
    }
    info!("Target dimensions: {}x{}", TARGET_WIDTH, TARGET_HEIGHT);
    info!("Palette colors used: {}", NUM_PALETTE_COLORS);
    info!("Blur sigma applied: {}", BLUR_SIGMA);
    info!("--- End of Report ---");

    info!("\nProcess completed.");
    Ok(())
}

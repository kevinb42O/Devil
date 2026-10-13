// hand_batch
#version 330
in        vec3 in_position;
in        vec2 in_uv0;
in        vec2 in_uv1;
uniform mat4 view_proj_matrix;
uniform vec3 cam_position;
uniform float light_scale;
uniform sampler2D tex_diffuse;
uniform sampler2D tex_reflect;
uniform vec3 light_pos;
uniform mat4 inst_data[ 35 ];
out     vec2 vert_uv0;
out     vec4 vert_world_position;
void main( )
{
	int inst_i = clamp( int( in_uv1.x ), 0, 34 );
	mat4 world_matrix = inst_data[ inst_i ];
	vec4 uv_scale_offset = vec4( world_matrix[ 0 ].w,world_matrix[ 1 ].w,world_matrix[ 2 ].w,world_matrix[ 3 ].w);
	world_matrix[ 0 ].w = 0.0;
	world_matrix[ 1 ].w = 0.0;
	world_matrix[ 2 ].w = 0.0;
	world_matrix[ 3 ].w = 1.0;
 
	vert_uv0 = in_uv0 * uv_scale_offset.xx + uv_scale_offset.zw;
	
	vec4 world_position = world_matrix * vec4( in_position, 1.0 );
	world_position = floor( world_position * 200.0 ) / 200.0;
	vert_world_position = world_position;
	gl_Position = view_proj_matrix * world_position;
}